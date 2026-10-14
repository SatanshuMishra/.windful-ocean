# Troubleshooting Guide

This guide covers common issues and their solutions when using my dotfiles.

## Installation Issues

### Install Prints "cannot link"
Problem: `install: cannot link ~/<target>: <error code>` during install

The target's parent path is not a folder you can write to, for example `~/.config` is a regular file. install still places the other links and exits 1.

Solutions:
```bash
# Look at what is in the way
ls -la ~/.config ~/.claude

# Move the blocking file aside, then run install again
mv ~/.config ~/.config.moved
node scripts/dotfiles/cli.mjs install
```

### Permission Denied Errors
Problem: Permission errors when creating symlinks

Solutions:
```bash
# Ensure you own your home directory
sudo chown -R $USER:$USER $HOME

# Check if files are write-protected
ls -la ~/ | grep -E '\.(zshrc|gitconfig|wezterm)'

# Remove write protection if needed
chmod u+w ~/.zshrc ~/.gitconfig ~/.wezterm.lua
```

### Existing Config Conflicts
Problem: A file or folder already sits where a link should go

install keeps it for you. A real file or folder, or a link to another place, is moved or copied to `~/.dotfiles-backup/<time>/<target>` and the link is placed; the line `install: backed up ~/<target> to <backup path>` names where it went.

Solutions:
```bash
# See what install kept
ls -la ~/.dotfiles-backup/

# Put one back by hand if you want it, for example
cp ~/.dotfiles-backup/<time>/.zshrc ~/.zshrc.old
```

### check Reports Problems
Problem: `node scripts/dotfiles/cli.mjs check` prints one line per problem and exits 1. It changes nothing; a SessionStart hook runs it in every new Claude Code session and shows the same lines under `dotfiles check found problems:`.

| Line | Meaning | Fix |
|---|---|---|
| `check: ~/<target> is missing; run install` | The link does not exist. | Run `node scripts/dotfiles/cli.mjs install`. |
| `check: ~/<target> is a real file, not a link; move your changes into <clone>/<source>, then run install` | A real file replaced the link, so edits to it never reach the repository. A real folder gives the same line with "folder". | Copy your changes into the clone's source, then run install, which keeps the file under `~/.dotfiles-backup/<time>/`. |
| `check: ~/<target> links to <destination>, not <clone>/<source>; run install` | The link points somewhere else, such as the development checkout after the cutover. | Run install from the clone you want live. |
| `check: cannot read ~/<target>: <error code>` | A link target could not be looked up, usually because a folder above it lost its permissions. | Restore that folder's mode, for example `chmod 755 ~/.claude`, and run check again. |

### Update Fails: "untracked working tree files would be overwritten"
Problem: `git -C ~/.windful-ocean pull --ff-only` refuses because an untracked file that cutover copied into the live clone would be overwritten by a file the pull brings in.

Solutions:
```bash
# The refusal lists the files; delete exactly those from the live clone
rm ~/.windful-ocean/<listed file>

# Pull again, then relink and resync
git -C ~/.windful-ocean pull --ff-only
node ~/.windful-ocean/scripts/dotfiles/cli.mjs install
node ~/.windful-ocean/scripts/dotfiles/cli.mjs sync
```

### sync Refuses the Settings File
Problem: `node scripts/dotfiles/cli.mjs sync` exits 1 and leaves `~/.claude/settings.json` untouched.

| Line | Fix |
|---|---|
| `sync: ~/.claude/settings.json is a symbolic link; run cutover first` | The settings file is still a link into a checkout. Run the cutover described in the root README, which turns it into a real file, then sync again. |
| `sync: ~/.claude/settings.json is not valid JSON; fix it and run sync again` | Open the file, repair the JSON, then run sync again. |
| `sync: ~/.claude/settings.json is not a JSON object; fix it and run sync again` | The file must hold one JSON object. Fix it, then run sync again. |

### New Hook or Rule File Doesn't Take Effect
Problem: A script just added to `.claude/hooks/` doesn't run, or a file just added to `.claude/rules/` is missing from context.

Cause: `~/.claude/hooks` and `~/.claude/rules` are links to the clone's folders, so a new file shows up only in the clone that the links point into. Edits made in the development checkout reach `~/.claude` only after the cutover and after the live clone is updated.

Solutions:
```bash
# Confirm where the links point
readlink ~/.claude/hooks

# Update the live clone and relink
git -C ~/.windful-ocean pull --ff-only
node ~/.windful-ocean/scripts/dotfiles/cli.mjs install
node ~/.windful-ocean/scripts/dotfiles/cli.mjs sync
```

---

## Terminal Issues

### Icons Not Displaying
Problem: Terminal shows boxes or missing icons

Solutions:
1. Install a Nerd Font:
```bash
# macOS
brew tap homebrew/cask-fonts
brew install font-jetbrains-mono-nerd-font

# Linux - download from https://www.nerdfonts.com/
```

2. Update terminal font settings:
- WezTerm: Already configured in my `.wezterm.lua`
- iTerm2: Preferences → Profiles → Text → Font → JetBrains Mono
- Terminal.app: Preferences → Profiles → Font → JetBrains Mono

### Colors Not Working
Problem: Terminal appears without colors or with wrong colors

Solutions:
```bash
# Check if terminal supports 256 colors
echo $TERM
# Should output: xterm-256color or screen-256color

# Test color support
curl -s https://gist.githubusercontent.com/lifepillar/09a44b8cf0f9397465614e622979107f/raw/24-bit-color.sh | bash

# Force 256 color support in shell
export TERM=xterm-256color
```

### My Tmux Setup Issues
Problem: Tmux colors or my plugins not working

Solutions:
```bash
# Install Tmux Plugin Manager
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

# Install plugins (inside tmux)
tmux
# Press: Ctrl-Space + I

# Reload tmux config
tmux source-file ~/.tmux.conf

# Check tmux version (needs 2.1+)
tmux -V
```

---

## Neovim Issues

Every Neovim-specific problem — startup failures, LSP servers not attaching, plugins not loading, slow startup — is covered in one place: [Troubleshooting](../.config/nvim/README.md#troubleshooting) in the Neovim README.

---

## Shell Issues

### My Zsh Not Loading Properly
Problem: My shell features missing or errors on startup

Solutions:
```bash
# Check if zsh is default shell
echo $SHELL
# Should output: /bin/zsh or /usr/bin/zsh

# Change default shell to zsh
chsh -s $(which zsh)

# Reload shell configuration
source ~/.zshrc

# Check for syntax errors
zsh -n ~/.zshrc

# Start with minimal zsh config
zsh -f
```

### My Zinit Plugin Issues
Problem: My Zsh plugins not loading or working

Solutions:
```bash
# Reinstall Zinit
rm -rf "${ZINIT_HOME}"
mkdir -p "$(dirname $ZINIT_HOME)"
git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"

# Update all plugins
zinit update --all

# Check plugin status
zinit status

# Clear cache and reload
zinit cclear
source ~/.zshrc
```

### My Modern CLI Tools Not Working
Problem: `eza`, `bat`, `fd` commands not found

Solutions:
```bash
# Check if tools are installed
which eza bat fd rg zoxide

# Install missing tools
# macOS
brew install eza bat fd ripgrep zoxide

# Ubuntu/Debian
sudo apt install exa bat fd-find ripgrep zoxide

# Arch Linux
sudo pacman -S eza bat fd ripgrep zoxide

# Check aliases
alias | grep -E "(ls|cat|find|grep)"
```

---

## Git Issues

### My Delta Setup Not Working
Problem: Git diffs don't use delta or show wrong colors

Solutions:
```bash
# Check if delta is installed
which delta

# Install delta
# macOS
brew install git-delta

# Ubuntu/Debian
sudo apt install git-delta

# Arch Linux
sudo pacman -S git-delta

# Check git config
git config --get core.pager
# Should output: delta

# Test delta manually
echo "diff example" | delta
```

### My Git Aliases Not Working
Problem: My git shortcuts like `gs`, `ga` not recognized

Solutions:
```bash
# Check if my aliases are loaded
alias | grep git

# Reload my shell configuration
source ~/.zshrc

# Check git global config
git config --global --list | grep alias

# Manually source git aliases
source ~/.zshrc
```

---

## Common Error Messages

### "Permission denied (publickey)"
Problem: Git operations fail with SSH errors

Solutions:
```bash
# Check SSH keys
ls -la ~/.ssh/

# Generate new SSH key if needed
ssh-keygen -t ed25519 -C "your-email@example.com"

# Add SSH key to ssh-agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Test GitHub connection
ssh -T git@github.com
```

### "command not found" for installed tools
Problem: Tools are installed but not in PATH

Solutions:
```bash
# Check PATH
echo $PATH

# Reload shell
source ~/.zshrc

# Check if tools are in standard locations
ls /usr/local/bin/ | grep -E "(eza|bat|fd|rg)"
ls /opt/homebrew/bin/ | grep -E "(eza|bat|fd|rg)"

# Manually add to PATH temporarily
export PATH="/opt/homebrew/bin:$PATH"
```

### "Plugin manager not found"
Problem: Neovim can't find my Lazy.nvim setup

Solution: see [Plugin Installation Fails](../.config/nvim/README.md#plugin-installation-fails) in the Neovim README.

---

## Health Checks

Neovim-specific health checks (`:checkhealth lsp`, `:checkhealth treesitter`, and the rest) are covered under [Getting Help](../.config/nvim/README.md#getting-help) in the Neovim README.

### Check My System Health
```bash
# Check essential tools
for tool in nvim tmux git zsh node; do
  if command -v $tool &> /dev/null; then
    echo "OK: $tool: $(which $tool)"
  else
    echo "MISSING: $tool: not found"
  fi
done

# Check modern CLI tools
for tool in eza bat fd rg zoxide; do
  if command -v $tool &> /dev/null; then
    echo "OK: $tool: $(which $tool)"
  else
    echo "WARN: $tool: not found (optional)"
  fi
done
```

### Check My Environment
```bash
# Display environment information
echo "OS: $OS_NAME"
echo "Shell: $SHELL"
echo "Terminal: $TERM"
echo "Editor: $EDITOR"
echo "Home: $HOME"
echo "User: $USER"
```

---

## Getting Help

### Enable Debug Mode for My Setup
```bash
# Debug my Zsh setup
zsh -x ~/.zshrc

# Neovim verbose mode
nvim -V9nvim.log

# Tmux verbose mode
tmux -v
```

### Backup and Reset My Config
```bash
# Create full backup
cp -r ~/.config/nvim ~/.config/nvim.backup
cp ~/.zshrc ~/.zshrc.backup
cp ~/.tmux.conf ~/.tmux.conf.backup

# Reset to minimal configuration
mv ~/.config/nvim ~/.config/nvim.disabled
mv ~/.zshrc ~/.zshrc.disabled

# Test with fresh install of my dotfiles
git clone https://github.com/SatanshuMishra/.windful-ocean.git /tmp/dotfiles-test
cd /tmp/dotfiles-test
HOME="$(mktemp -d)" node scripts/dotfiles/cli.mjs install
```

### Getting Help
- GitHub Issues: Report bugs or request features for my dotfiles
- Neovim Community: https://github.com/neovim/neovim/discussions
- Tmux Issues: https://github.com/tmux/tmux/issues
- Zsh Users: https://zsh.sourceforge.io/

Remember: When reporting issues with my dotfiles, include:
1. Operating system and version
2. Terminal emulator and version
3. Exact error messages
4. Steps to reproduce the problem
5. Output of relevant health checks