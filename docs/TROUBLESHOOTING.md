# Troubleshooting Guide

This guide covers common issues and their solutions when using my dotfiles.

## Installation Issues

### GNU Stow Not Found
Problem: `stow: command not found` during installation

Solutions:
```bash
# macOS
brew install stow

# Ubuntu/Debian
sudo apt update && sudo apt install stow

# Arch Linux
sudo pacman -S stow

# Fedora
sudo dnf install stow

# CentOS/RHEL
sudo yum install stow
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
Problem: Stow fails due to existing configuration files

Solutions:
```bash
# Backup existing configs
mkdir -p ~/.config-backup-$(date +%Y%m%d)
mv ~/.zshrc ~/.config-backup-$(date +%Y%m%d)/
mv ~/.gitconfig ~/.config-backup-$(date +%Y%m%d)/
mv ~/.config/nvim ~/.config-backup-$(date +%Y%m%d)/

# Then run stow again
stow . -t ~
```

### New Hook or Rule File Doesn't Take Effect
Problem: A script just added to `.claude/hooks/` doesn't run, or a file just added to `.claude/rules/` is missing from context — no error, it just silently doesn't fire.

Trigger: `~/.claude/hooks` and `~/.claude/rules` are the two exceptions to "everything under `~/.claude` is a live symlink." Both contain files that exist only in the home tree and not in the repo — a `graphify-out/` cache in each, plus `rules/context7.md`. GNU Stow cannot collapse a directory into a single symlink when it has to coexist with content it does not own, so it links each child individually instead. A new top-level file dropped directly into `.claude/hooks/` or `.claude/rules/` therefore has no live symlink until Stow runs again. Files added inside an already-linked subdirectory (`hooks/lib/`, `hooks/tests/`, `rules/common/`, `rules/typescript/`) are unaffected, because those subdirectories are themselves whole-directory symlinks.

Solutions:
```bash
# Re-run the installer to link the new file
./scripts/install_config.sh

# Confirm the symlink now exists
ls -la ~/.claude/hooks/<new-script>.sh
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
for tool in nvim tmux git zsh stow; do
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
./scripts/install_config.sh
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