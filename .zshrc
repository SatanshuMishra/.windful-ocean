# Add deno completions to search path
if [[ ":$FPATH:" != *":/Users/satanshumishra/.zsh/completions:"* ]]; then export FPATH="/Users/satanshumishra/.zsh/completions:$FPATH"; fi
export ZSH="$HOME/.oh-my-zsh"

#ZSH_THEME="robbyrussell"
ZSH_THEME="common"

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

plugins=(git)

source $ZSH/oh-my-zsh.sh

alias sa='source ~/.zshrc;echo "ZSH aliases sourced."'
alias vim=nvim
alias ls="ls -a"

function ccd() {
	# Change to a specified directory
	cd "$1" || return

	# Set the padding size (adjust as needed)
	padding_size=1

	# Construct padding on both sides
	padding=$(printf "%*s" "$padding_size")

	# Print the new directory
	echo -e "Current Directory: $PWD"
	# List the contents of the directory
	ls -a
}

function gcr() {
	cd ~/Documents/DevLab/
	
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
    local base_directory="$HOME/Documents/DevLab"

    if [ -n "$optional_param" ]; then
        cd "$base_directory/$optional_param" || return 1
#	echo -e "Changed directory to: $base_directory/$optional_param"
		clear
		echo -e "Moved into the $optional_param 👀"
    else
        cd "$base_directory" || return 1
#        echo "Changed directory to: $base_directory"
		clear
		echo "Now Entering the Development Zone"
#		echo -e "Changed directory to: $base_directory/$optional_param"
    fi
}

function ezsh() {
	nvim $HOME/Documents/DevLab/.windful-ocean/.zshrc
}

function evim() {
	nvim  $HOME/Documents/DevLab/.windful-ocean/.config/nvim/init.lua
}

function term() {
	nvim $HOME/Documents/DevLab/.windful-ocean/.wezterm.lua
}

function helpme() {
	echo "
	Hi Me! Looks like forgot your terminal commands...again 🐧\n
	Here's a reminder:\n
	1. evim: Edit NeoVIM config
	2. term: Edit WezTerm config
	3. ezsh: Edit Zshrc config
	4. dev ~[repo-name]: Go to Development Zone. Go into specific repo if provided.
	5. gcr [repo-url]: Clone and go into specified repo.
	6. helpme: To help you...Wait. You just ran this command ;-;
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

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
. "/Users/satanshumishra/.deno/env"
# Initialize zsh completions (added by deno install script)
autoload -Uz compinit
compinit
