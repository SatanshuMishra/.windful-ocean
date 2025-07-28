# Windful Ocean Dotfiles

Welcome to my comprehensive, cross-platform dotfiles repository! I've crafted this setup to provide a modern, efficient development environment that works seamlessly across macOS and Linux systems.

## Features

### Modern Development Environment
- Neovim: Fully configured with LSP, completion, debugging, and 50+ plugins
- Zsh: Enhanced shell with modern tools and intelligent completions  
- Tmux: Session management with automatic persistence and restoration
- Git: Beautiful diffs with delta, comprehensive aliases, and smart defaults

### Smart Tools Integration
- Modern CLI Tools: `eza`, `bat`, `fd`, `ripgrep`, `zoxide` with fallbacks
- Fuzzy Finding: Enhanced `fzf` with preview and custom colors
- Session Management: Auto-save/restore for both Neovim and Tmux sessions
- Cross-Platform: Works on macOS, Ubuntu, Arch, Fedora, and more

### Beautiful & Consistent
- Themes: Catppuccin colorscheme across all tools
- Prompts: Choice between Powerlevel10k and Starship
- Typography: Optimized for JetBrains Mono with ligatures
- Icons: Consistent iconography throughout the terminal

### Performance Optimized
- Mini.nvim Suite: Faster, unified plugin architecture
- Lazy Loading: Plugins load only when needed
- Startup Time: Optimized for quick shell and editor startup
- Smart Caching: Intelligent caching across all tools

## Installation

### Prerequisites

macOS:
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Linux:
```bash
# Ensure you have git and curl installed
sudo apt update && sudo apt install git curl  # Ubuntu/Debian
sudo pacman -S git curl                       # Arch
sudo dnf install git curl                     # Fedora
```

### Quick Install (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/satanshumishra/windful-ocean.git ~/.dotfiles
cd ~/.dotfiles
```

2. Run the installation script:
```bash
./scripts/install_config.sh
```

My installation script will:
- Detect your operating system
- Install GNU Stow if needed
- Backup existing configurations
- Install dotfiles using symlinks
- Provide next steps for setup

### Manual Installation

If you prefer to install manually, here's how I set it up:

1. Install GNU Stow:
```bash
# macOS
brew install stow

# Ubuntu/Debian
sudo apt install stow

# Arch
sudo pacman -S stow

# Fedora
sudo dnf install stow
```

2. Install dotfiles:
```bash
# Navigate to the cloned repository
cd ~/.dotfiles

# Test installation (dry run)
stow -nv . -t ~

# Install if no conflicts
stow . -t ~
```

## Quick Start

After you install my dotfiles:

1. Restart your terminal or run:
```bash
source ~/.zshrc
```

2. Install recommended tools:
```bash
# macOS
brew install eza bat fd ripgrep zoxide starship delta

# Ubuntu/Debian  
sudo apt install exa bat fd-find ripgrep zoxide git-delta

# Arch
sudo pacman -S eza bat fd ripgrep zoxide starship git-delta

# Fedora
sudo dnf install eza bat fd-find ripgrep zoxide starship git-delta
```

3. Configure Git with your details:
```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

4. Install Tmux plugins (I use TPM):
```bash
# Start tmux and press prefix + I (Ctrl-Space + I)
tmux
# Then: Ctrl-Space + I
```

## Documentation

- **[Keybindings Reference](docs/KEYBINDINGS.md)** - Complete list of shortcuts
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Customization Guide](docs/CUSTOMIZATION.md)** - How to personalize your setup

## Project Structure

```
.
├── .config/
│   ├── nvim/                 # Neovim configuration
│   │   ├── lua/
│   │   │   ├── core/         # Core Neovim settings
│   │   │   ├── plugins/      # Plugin configurations
│   │   │   └── themes/       # Theme settings
│   │   └── init.lua         # Main Neovim config
│   ├── tmux/                # Tmux configuration
│   ├── starship.toml        # Starship prompt config
│   └── ripgrep/             # Ripgrep settings
├── scripts/                 # Installation & maintenance scripts
├── docs/                    # Documentation
├── .zshrc                   # Zsh configuration
├── .gitconfig               # Git configuration
├── .gitignore_global        # Global gitignore
└── .wezterm.lua            # WezTerm terminal config
```

## Key Features

### Neovim Enhancements
- LSP Integration: I've configured 15+ language servers with auto-setup
- Live Rename: You can see changes across files before confirming
- Session Management: Resume exactly where you left off
- AI Assistance: GitHub Copilot integration for coding assistance
- Modern UI: Beautiful interfaces for all operations

### Shell Improvements  
- Smart Completions: Context-aware command completions
- Directory Jumping: The `z` command learns your navigation patterns
- Enhanced History: Persistent, searchable command history
- Cross-Platform: I've made sure you get the same experience on any Unix system

### Git Workflow
- Beautiful Diffs: Side-by-side comparisons with syntax highlighting using delta
- Smart Aliases: I've created shortcuts for common operations
- Auto-Setup: Sensible defaults for modern Git workflows

## Maintenance

### Update Configurations
```bash
# Update repository with current system configs
./scripts/update_config.sh
```

I run this script to sync my current configurations back to the repository.

### Switch Prompt (Powerlevel10k ↔ Starship)
```bash
# Edit ~/.zshrc and toggle between:
# zinit ice depth=1; zinit light romkatv/powerlevel10k  # Comment this
# eval "$(starship init zsh)"                          # Uncomment this
```

I've included both prompt options so you can choose your preference.

### Add Your Own Customizations
- Local overrides: `~/.zshrc.local`, `~/.gitconfig.local`
- Project-specific: `.envrc` files for direnv integration

I've designed the system to be easily customizable without modifying the core files.

## Contributing

Found a bug or have a suggestion? I'd love to hear from you! Please open an issue or submit a pull request.

## License

MIT License - feel free to use my configurations for your own setup!

---

Happy coding!
