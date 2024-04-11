# If you come from bash you might have to change your $PATH.
# export PATH=$HOME/bin:/usr/local/bin:$PATH

# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load --- if set to "random", it will
# load a random theme each time oh-my-zsh is loaded, in which case,
# to know which specific one was loaded, run: echo $RANDOM_THEME
# See https://github.com/ohmyzsh/ohmyzsh/wiki/Themes
#ZSH_THEME="robbyrussell"
ZSH_THEME="common"

# Set list of themes to pick from when loading at random
# Setting this variable when ZSH_THEME=random will cause zsh to load
# a theme from this variable instead of looking in $ZSH/themes/
# If set to an empty array, this variable will have no effect.
# ZSH_THEME_RANDOM_CANDIDATES=( "robbyrussell" "agnoster" )

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion.
# Case-sensitive completion must be off. _ and - will be interchangeable.
# HYPHEN_INSENSITIVE="true"

# Uncomment one of the following lines to change the auto-update behavior
# zstyle ':omz:update' mode disabled  # disable automatic updates
# zstyle ':omz:update' mode auto      # update automatically without asking
# zstyle ':omz:update' mode reminder  # just remind me to update when it's time

# Uncomment the following line to change how often to auto-update (in days).
# zstyle ':omz:update' frequency 13

# Uncomment the following line if pasting URLs and other text is messed up.
# DISABLE_MAGIC_FUNCTIONS="true"

# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
# You can also set it to another string to have that shown instead of the default red dots.
# e.g. COMPLETION_WAITING_DOTS="%F{yellow}waiting...%f"
# Caution: this setting can cause issues with multiline prompts in zsh < 5.7.1 (see #5765)
# COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# You can set one of the optional three formats:
# "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# or set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
# HIST_STAMPS="mm/dd/yyyy"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load?
# Standard plugins can be found in $ZSH/plugins/
# Custom plugins may be added to $ZSH_CUSTOM/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(git)

source $ZSH/oh-my-zsh.sh

# User configuration

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8

# Preferred editor for local and remote sessions
# if [[ -n $SSH_CONNECTION ]]; then
#   export EDITOR='vim'
# else
#   export EDITOR='mvim'
# fi

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

# Set personal aliases, overriding those provided by oh-my-zsh libs,
# plugins, and themes. Aliases can be placed here, though oh-my-zsh
# users are encouraged to define aliases within the ZSH_CUSTOM folder.
# For a full list of active aliases, run `alias`.
#
# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"

alias sa='source ~/.zshrc;echo "ZSH aliases sourced."'
alias vim=nvim
# alias ls="ls -a"

function ccd() {
	# Change to a specified directory
	cd "$1" || return

	# Set the padding size (adjust as needed)
	padding_size=1

	# Construct padding on both sides
	padding=$(printf "%*s" "$padding_size")

	# Print the new directory
	# echo -e "\033[1;37;48;2;54;163;217m Current Directory: $PWD \033[0m"
	# echo -e "\033[1;37;48;2;130;170;255m Current Directory: $PWD \033[0m"
	# echo -e "\033[1;37;48;2;0;81;255m Current Directory: $PWD \033[0m"
	echo -e "Current Directory: $PWD"
	# List the contents of the directory
	ls -a
}

# alias cd=ccd

function gc() {
	cd ~/Documents/GitHub/
	
	if [ -z "$1" ]; then
		echo "Useage: git clone <repository_url>"
		return 1
	fi

	# git clone "$1"
	
	local repo_url="$1"
    local repo_name

    # Extract the text after the last /
    repo_name=$(echo "$repo_url" | awk -F/ '{print $NF}')
    # Remove ".git" from the extracted text
    repo_name=${repo_name%.git}
    # Clone the repository
    git clone "$repo_url" || return 1
    # Change into the newly created Git repository directory
    cd "$repo_name" || return 1
	echo -e "Moved into the $repo_name 👀"
}

function dev() {
    local optional_param="$1"
    local base_directory="$HOME/Documents/GitHub"

    if [ -n "$optional_param" ]; then
        cd "$base_directory/$optional_param" || return 1
#	echo -e "Changed directory to: $base_directory/$optional_param"
		echo -e "Moved into the $optional_param 👀"
    else
        cd "$base_directory" || return 1
#        echo "Changed directory to: $base_directory"
		echo "Now Entering the Development Zone"
#		echo -e "Changed directory to: $base_directory/$optional_param"
    fi
}

function evim() {
	nvim  ~/.config/nvim/init.lua
}

function term() {
	nvim ~/.wezterm.lua
}

function helpme() {
	echo "
	Hi Me! Looks like forgot your terminal commands...again 🐧\n
	Here's a reminder:\n
	1. evim: Edit NeoVIM config
	2. term: Edit WezTerm config
	3. dev ~[repo-name]: Go to Development Zone. Go into specific repo if provided.
	4. gc [repo-url]: Clone and go into specified repo.
	5. helpme: To help you...Wait. You just ran this command ;-;
	"
} 

# pnpm
export PNPM_HOME="/Users/satanshumishra/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

# wezterm
PATH="$PATH:/Applications/WezTerm.app/Contents/MacOS"
export PATH
# wezterm end


#  INFORMATION: LOADS GIT VERSION CONTROL SYSTEM
# autoload -Uz vcs_info
# precmd() { vcs_info }


#  INFORMATION: LOADS GIT BRANCH DETAILS INTO PROMPT
#  Find complete documentation here: https://arjanvandergaag.nl/blog/customize-zsh-prompt-with-vcs-info.html
#	zstyle ':vcs_info:git:*' formats '%b '

#  INFORMATION: FINAL PROMPT STRUCTURE (INCLUDING COLOR)
#  Find complete documentation here: https://zsh.sourceforge.io/Doc/Release/Prompt-Expansion.html
#	setopt PROMPT_SUBST
#	PROMPT='%F{green}%*%f %F{blue}%~%f %F{red}${vcs_info_msg_0_}%f$ '
