# ============================================================================
#                        CROSS-PLATFORM INITIALIZATION
# ============================================================================

# OS Detection
export OS_TYPE="$(uname -s)"
case "${OS_TYPE}" in
    Darwin*)    export OS_NAME="macOS";;
    Linux*)     export OS_NAME="Linux";;
    CYGWIN*)    export OS_NAME="Cygwin";;
    MINGW*)     export OS_NAME="MinGW";;
    MSYS*)      export OS_NAME="MSYS";;
    *)          export OS_NAME="Unknown";;
esac

# Set OS-specific variables
if [[ "$OS_NAME" == "macOS" ]]; then
    export IS_MACOS=true
    export IS_LINUX=false
elif [[ "$OS_NAME" == "Linux" ]]; then
    export IS_MACOS=false
    export IS_LINUX=true
else
    export IS_MACOS=false
    export IS_LINUX=false
fi

# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# ============================================================================
#                        PACKAGE MANAGER SETUP
# ============================================================================

# macOS - Homebrew setup
if [[ "$IS_MACOS" == true ]]; then
    # Try different Homebrew installation paths
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
        export HOMEBREW_PREFIX="/opt/homebrew"
    elif [[ -f "/usr/local/bin/brew" ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
        export HOMEBREW_PREFIX="/usr/local"
    fi
fi

# Linux - Package manager detection
if [[ "$IS_LINUX" == true ]]; then
    # Set up package manager aliases based on distro
    if command -v apt &> /dev/null; then
        export PKG_MANAGER="apt"
        alias install="sudo apt install"
        alias update="sudo apt update && sudo apt upgrade"
        alias search="apt search"
    elif command -v pacman &> /dev/null; then
        export PKG_MANAGER="pacman"
        alias install="sudo pacman -S"
        alias update="sudo pacman -Syu"
        alias search="pacman -Ss"
    elif command -v dnf &> /dev/null; then
        export PKG_MANAGER="dnf"
        alias install="sudo dnf install"
        alias update="sudo dnf update"
        alias search="dnf search"
    elif command -v yum &> /dev/null; then
        export PKG_MANAGER="yum"
        alias install="sudo yum install"
        alias update="sudo yum update"
        alias search="yum search"
    fi
fi

# Set the directory we want to store zinit and plugins
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"

# Download Zinit, if it's not there yet
if [ ! -d "$ZINIT_HOME" ]; then
   mkdir -p "$(dirname $ZINIT_HOME)"
   git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi

# Source/Load zinit
source "${ZINIT_HOME}/zinit.zsh"

# ============================================================================
#                           PROMPT CONFIGURATION
# ============================================================================
# Choose your prompt: Powerlevel10k (current) or Starship (modern alternative)
# 
# To switch to Starship:
# 1. Comment out the Powerlevel10k lines below
# 2. Uncomment the Starship line
# 3. Restart your shell or run: source ~/.zshrc

# OPTION 1: Powerlevel10k (Current - feature-rich, zsh-specific)
zinit ice depth=1; zinit light romkatv/powerlevel10k

# OPTION 2: Starship (Modern - cross-shell, fast, written in Rust)
# eval "$(starship init zsh)"

# NOTE: Only one prompt should be active at a time

# Add in zsh plugins
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions
zinit light Aloxaf/fzf-tab

# Add in snippets
zinit snippet OMZL::git.zsh
zinit snippet OMZP::git
zinit snippet OMZP::sudo
zinit snippet OMZP::archlinux
zinit snippet OMZP::aws
zinit snippet OMZP::kubectl
zinit snippet OMZP::kubectx
zinit snippet OMZP::command-not-found

# Load completions
autoload -Uz compinit && compinit

zinit cdreplay -q

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

# Keybindings
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward
bindkey '^[w' kill-region

#History
HISTSIZE=5000
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

# Completion styling
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' menu no
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'

# ============================================================================
#                           MODERN CLI TOOLS & ALIASES
# ============================================================================

# EDITOR
alias vim='nvim'
alias v='nvim'
alias c='clear'

# MODERN FILE LISTING (eza replaces ls)
if command -v eza &> /dev/null; then
    alias ls='eza --color=auto --icons --group-directories-first'
    alias ll='eza -la --color=auto --icons --group-directories-first --git'
    alias la='eza -la --color=auto --icons --group-directories-first'
    alias lt='eza --tree --level=2 --color=auto --icons'
    alias lta='eza --tree --level=2 --color=auto --icons -a'
else
    # Fallback to standard ls with colors (OS-specific)
    if [[ "$IS_MACOS" == true ]]; then
        alias ls='ls -G'  # macOS uses -G for colors
        alias ll='ls -laG'
        alias la='ls -laG'
    else
        alias ls='ls --color=auto'  # Linux uses --color
        alias ll='ls -la --color=auto'
        alias la='ls -la --color=auto'
    fi
fi

# MODERN FILE VIEWING (bat replaces cat)
if command -v bat &> /dev/null; then
    alias cat='bat --paging=never'
    alias less='bat'
    alias bathelp='bat --help'
    # Function to use bat with syntax highlighting for specific files
    function bcat() {
        bat --style=numbers --color=always "$@"
    }
else
    # Fallback to standard cat
    alias cat='cat'
fi

# MODERN FILE SEARCHING (fd replaces find)
if command -v fd &> /dev/null; then
    alias find='fd'
    alias ff='fd --type f'  # Find files only
    alias fd-hidden='fd --hidden --no-ignore'  # Include hidden files
else
    # Fallback to standard find
    alias find='find'
fi

# ENHANCED GREP (ripgrep)
if command -v rg &> /dev/null; then
    alias grep='rg'
    alias rgi='rg --ignore-case'
    alias rga='rg --hidden --no-ignore'  # Search all files including hidden
    function rgf() {  # Search for pattern in specific file types
        rg --type "$1" "${@:2}"
    }
else
    # Fallback to standard grep
    alias grep='grep --color=auto'
fi

# GIT ENHANCEMENTS
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'
alias gd='git diff'
alias gco='git checkout'
alias gb='git branch'
alias glog='git log --oneline --graph --decorate'

# QUICK NAVIGATION
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias home='cd ~'
alias proj='cd ~/Projects 2>/dev/null || cd ~/Documents/Projects 2>/dev/null || cd ~/Dev 2>/dev/null || echo "No projects directory found"'

# SYSTEM UTILITIES
alias df='df -h'
alias du='du -h'
alias free='free -h'
alias ping='ping -c 5'
alias wget='wget -c'  # Continue partial downloads
alias ports='netstat -tulanp'  # Show listening ports

# DOCKER (if installed)
if command -v docker &> /dev/null; then
    alias dps='docker ps'
    alias dpsa='docker ps -a'
    alias di='docker images'
    alias dex='docker exec -it'
    alias dlog='docker logs'
    alias dstop='docker stop $(docker ps -q)'  # Stop all running containers
    alias drm='docker rm $(docker ps -aq)'     # Remove all containers
fi

# KUBERNETES (if installed)
if command -v kubectl &> /dev/null; then
    alias k='kubectl'
    alias kget='kubectl get'
    alias kdesc='kubectl describe'
    alias klog='kubectl logs'
    alias kexec='kubectl exec -it'
fi

# TMUX SHORTCUTS
if command -v tmux &> /dev/null; then
    alias ta='tmux attach'
    alias tls='tmux list-sessions'
    alias tnew='tmux new-session -s'
    alias tkill='tmux kill-session -t'
fi

# ============================================================================
#                           TOOL CONFIGURATIONS
# ============================================================================

# BAT CONFIGURATION
export BAT_THEME="Catppuccin-mocha"  # Use catppuccin theme for bat
export BAT_STYLE="numbers,changes,header"  # Show line numbers, git changes, and header

# FZF CONFIGURATION  
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_DEFAULT_OPTS='
    --height 40% 
    --layout=reverse 
    --border 
    --preview="bat --color=always --style=numbers --line-range=:500 {}"
    --color=bg+:#313244,bg:#1e1e2e,spinner:#f5e0dc,hl:#f38ba8
    --color=fg:#cdd6f4,header:#f38ba8,info:#cba6fc,pointer:#f5e0dc
    --color=marker:#f5e0dc,fg+:#cdd6f4,prompt:#cba6fc,hl+:#f38ba8'

# EZA CONFIGURATION
export EZA_COLORS="da=36:gm=33"  # Custom colors for eza

# RIPGREP CONFIGURATION
export RIPGREP_CONFIG_PATH="$HOME/.config/ripgrep/config"

# ============================================================================
#                           SHELL INTEGRATIONS
# ============================================================================

# FZF integration
eval "$(fzf --zsh)"

# Zoxide integration (smart cd replacement)
eval "$(zoxide init --cmd cd zsh)"

# ============================================================================
#                           PATH CONFIGURATION
# ============================================================================

# macOS-specific PATH additions
if [[ "$IS_MACOS" == true ]]; then
    # PNPM (Node.js package manager)
    export PNPM_HOME="$HOME/Library/pnpm"
    case ":$PATH:" in
      *":$PNPM_HOME:"*) ;;
      *) export PATH="$PNPM_HOME:$PATH" ;;
    esac
    
    # Homebrew PHP (if installed)
    if [[ -d "/opt/homebrew/opt/php@8.3" ]]; then
        export PATH="/opt/homebrew/opt/php@8.3/bin:$PATH"
        export PATH="/opt/homebrew/opt/php@8.3/sbin:$PATH"
    fi
    
    # Google Depot Tools (if exists)
    if [[ -d "$HOME/depot_tools.git" ]]; then
        export PATH="$PATH:$HOME/depot_tools.git"
    fi
    
    # macOS-specific binaries
    if [[ -d "/opt/homebrew/bin" ]]; then
        export PATH="/opt/homebrew/bin:$PATH"
    fi
    if [[ -d "/opt/homebrew/sbin" ]]; then
        export PATH="/opt/homebrew/sbin:$PATH"
    fi
fi

# Linux-specific PATH additions
if [[ "$IS_LINUX" == true ]]; then
    # PNPM (Node.js package manager) - Linux location
    export PNPM_HOME="$HOME/.local/share/pnpm"
    case ":$PATH:" in
      *":$PNPM_HOME:"*) ;;
      *) export PATH="$PNPM_HOME:$PATH" ;;
    esac
    
    # Snap packages
    if [[ -d "/snap/bin" ]]; then
        export PATH="/snap/bin:$PATH"
    fi
    
    # Flatpak
    if [[ -d "/var/lib/flatpak/exports/bin" ]]; then
        export PATH="/var/lib/flatpak/exports/bin:$PATH"
    fi
    
    # AppImage directory
    if [[ -d "$HOME/Applications" ]]; then
        export PATH="$HOME/Applications:$PATH"
    fi
fi

# Cross-platform PATH additions
# Local bin directories
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/bin:$PATH"

# Cargo (Rust) - if installed
if [[ -d "$HOME/.cargo/bin" ]]; then
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Go binaries - if Go is installed
if command -v go &> /dev/null; then
    export GOPATH="$HOME/go"
    export PATH="$PATH:$GOPATH/bin"
fi

# Python user binaries
if [[ -d "$HOME/.local/bin" ]]; then
    export PATH="$HOME/.local/bin:$PATH"
fi
