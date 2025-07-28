# Satanshu's Neovim Configuration

A comprehensive, modular Neovim configuration optimized for full-stack development with support for 15+ programming languages, advanced Git integration, AI assistance, and powerful development tools.

## Table of Contents

- [Features](#features)
- [File Structure](#file-structure)
- [Installation](#installation)
- [Plugin Inventory](#plugin-inventory)
- [Keybinding Reference](#keybinding-reference)
- [Language Servers](#language-servers)
- [Commands Reference](#commands-reference)
- [Customization Guide](#customization-guide)
- [Troubleshooting](#troubleshooting)

## Features

### Core Development Features
- **Multi-Language LSP Support**: TypeScript, Rust, PHP, Python, C/C++, HTML/CSS, SQL, Bash, and more
- **Advanced Git Integration**: LazyGit interface, Gitsigns for inline git status
- **AI Code Assistance**: GitHub Copilot integration for intelligent code completion
- **Powerful Search**: Telescope fuzzy finder for files, content, and symbols
- **Debug Support**: Debug Adapter Protocol (DAP) with PHP Xdebug integration
- **Code Quality**: Automatic formatting, linting, and syntax highlighting

### Productivity Enhancements
- **File Navigation**: Oil file manager, Harpoon quick access, tmux integration
- **Discord Rich Presence**: Shows current project and tmux session context
- **Code Screenshots**: Silicon for creating beautiful code screenshots
- **Todo Management**: Track TODO, FIXME, and other comment annotations
- **Visual Enhancements**: Custom themes, status line, color highlighting

### Development Environment
- **Tmux Integration**: Seamless navigation between vim and tmux panes
- **Terminal Integration**: WezTerm tab title updates, terminal enhancements
- **Performance Optimized**: Lazy-loaded plugins for fast startup times
- **Modular Architecture**: Easy to customize and extend

## File Structure

```
.config/nvim/
├── init.lua                 # Main entry point - loads all modules
├── README.md               # This comprehensive guide
├── init.lua.backup         # Backup of original configuration
├── lazy-lock.json          # Plugin version lockfile
├── ftdetect/              # File type detection
│   └── astro.lua          # Astro framework support
├── lua/
│   ├── core/              # Core Neovim functionality
│   │   ├── options.lua    # Editor settings and vim options
│   │   ├── keymaps.lua    # Global keymaps and leader setup
│   │   ├── autocmds.lua   # Event handlers and autocommands
│   │   └── utils.lua      # Utility functions and Discord presence
│   ├── plugins/           # Plugin specifications and configurations
│   │   ├── init.lua       # Lazy.nvim setup and plugin loader
│   │   ├── lsp/          # Language Server Protocol
│   │   │   ├── init.lua   # LSP setup and capabilities
│   │   │   ├── servers.lua # Individual server configurations
│   │   │   └── keymaps.lua # LSP-specific keybindings
│   │   ├── telescope.lua  # Fuzzy finder configuration
│   │   ├── completion.lua # Code completion and snippets
│   │   ├── treesitter.lua # Syntax highlighting
│   │   ├── debug.lua      # Debug adapters and configuration
│   │   ├── git.lua        # Git integration tools
│   │   ├── navigation.lua # File management tools
│   │   ├── ui.lua         # Visual enhancements and themes
│   │   ├── editor.lua     # Editing enhancements
│   │   ├── tools.lua      # Development tools
│   │   └── utilities.lua  # Utility plugins
│   └── themes/
│       └── init.lua       # Theme configuration
└── doc/                   # Documentation files
    ├── kickstart.txt      # Kickstart documentation
    └── tags               # Help tags
```

## Installation

### Prerequisites

- **Neovim 0.9+**: Latest stable version recommended
- **Git**: For plugin management and version control
- **Node.js**: Required for many language servers
- **Python 3**: For Python language server and formatters
- **Ripgrep (rg)**: For fast text searching
- **Make**: For building telescope-fzf-native
- **A Nerd Font**: For proper icon display

### Installation Steps

1. **Backup existing configuration**:
   ```bash
   mv ~/.config/nvim ~/.config/nvim.backup
   ```

2. **Clone this configuration**:
   ```bash
   git clone <your-repo-url> ~/.config/nvim
   ```

3. **Start Neovim**:
   ```bash
   nvim
   ```

4. **Wait for plugin installation**: Lazy.nvim will automatically install all plugins on first launch.

5. **Install language servers**: Open Mason with `:Mason` and install desired language servers.

### Environment Variables

- `NVIM_HIDDEN_PROJECT_PATH`: Path to project with redacted Discord presence

## Plugin Inventory

### Language Server Protocol

| Plugin | Purpose | Key Features |
|--------|---------|--------------|
| nvim-lspconfig | LSP client configuration | 15+ language servers, auto-completion |
| mason.nvim | LSP server manager | Easy installation and management |
| fidget.nvim | LSP progress indicator | Visual feedback for LSP operations |
| neodev.nvim | Neovim Lua development | Enhanced Lua LSP for Neovim config |
| schemastore.nvim | JSON schema validation | Auto-completion for JSON files |

### Code Completion & Snippets

| Plugin | Purpose | Key Features |
|--------|---------|--------------|
| nvim-cmp | Completion engine | Intelligent code completion |
| LuaSnip | Snippet engine | Powerful snippet expansion |
| nvim-autopairs | Auto-close brackets | Smart bracket and quote pairing |
| friendly-snippets | Snippet collection | Pre-built snippets for many languages |
| copilot.vim | AI assistance | GitHub Copilot integration |

### Navigation & Search

| Plugin | Purpose | Key Features |
|--------|---------|--------------|
| telescope.nvim | Fuzzy finder | File search, live grep, symbols |
| oil.nvim | File manager | Edit directories like buffers |
| harpoon | Quick file access | Mark and navigate to files quickly |
| flash.nvim | Motion enhancement | Improved f/t and search motions |

### Git Integration

| Plugin | Purpose | Key Features |
|--------|---------|--------------|
| gitsigns.nvim | Git decorations | Inline git status, hunk navigation |
| lazygit.nvim | Git interface | Full-featured git TUI |

### Visual Enhancements

| Plugin | Purpose | Key Features |
|--------|---------|--------------|
| lualine.nvim | Status line | Informative and customizable status bar |
| nvim-web-devicons | File icons | Beautiful file type icons |
| nvim-highlight-colors | Color preview | Highlight color codes in files |
| indent-blankline.nvim | Indentation guides | Visual indentation lines |
| catppuccin/nvim | Color theme | Modern, eye-friendly colorscheme |
| oxocarbon.nvim | Color theme | IBM's carbon design system theme |

### Development Tools

| Plugin | Purpose | Key Features |
|--------|---------|--------------|
| nvim-dap | Debug adapter | Debug support for multiple languages |
| conform.nvim | Code formatting | Multi-language code formatter |
| nvim-lint | Code linting | Real-time code analysis |
| nvim-treesitter | Syntax highlighting | Advanced syntax highlighting |
| presence.nvim | Discord integration | Rich presence with tmux awareness |
| nvim-silicon | Code screenshots | Beautiful code screenshots |

### Utilities

| Plugin | Purpose | Key Features |
|--------|---------|--------------|
| which-key.nvim | Keybinding help | Interactive keybinding guide |
| todo-comments.nvim | TODO management | Highlight and navigate TODO comments |
| trouble.nvim | Diagnostics viewer | Better diagnostic and quickfix lists |
| lspsaga.nvim | LSP enhancements | Enhanced LSP UI and actions |
| Comment.nvim | Comment toggling | Easy line and block commenting |

## Keybinding Reference

### Leader Key
| Key | Description |
|-----|-------------|
| `<Space>` | Main leader key |

### Core Navigation
| Key | Mode | Action |
|-----|------|--------|
| `<C-h/j/k/l>` | Normal | Tmux/window navigation |
| `<C-d>` | Normal | Half-page down (centered) |
| `<C-u>` | Normal | Half-page up (centered) |
| `j/k` | Normal | Move by visual lines when wrapped |
| `J` | Normal | Join lines without moving cursor |

### File Management
| Key | Mode | Action |
|-----|------|--------|
| `<leader>sf` | Normal | Search files |
| `<leader>sg` | Normal | Live grep search |
| `<leader>sw` | Normal | Search word under cursor |
| `<leader>gf` | Normal | Search git files |
| `<leader>?` | Normal | Recently opened files |
| `<leader><space>` | Normal | Find buffers |
| `<leader>/` | Normal | Fuzzy search in current buffer |
| `-` | Normal | Open parent directory (Oil) |
| `<leader>fs` | Normal | Open netrw file system |

### Harpoon Quick Access
| Key | Mode | Action |
|-----|------|--------|
| `<leader>fa` | Normal | Add file to harpoon |
| `<C-e>` | Normal | Toggle harpoon menu |
| `<C-1>` to `<C-4>` | Normal | Navigate to harpoon file 1-4 |
| `<leader>p1` to `<leader>p4` | Normal | Open harpoon file 1-4 |

### Git Operations
| Key | Mode | Action |
|-----|------|--------|
| `<leader>gg` | Normal | Open LazyGit |
| `]c` | Normal | Next git hunk |
| `[c` | Normal | Previous git hunk |
| `<leader>hp` | Normal | Preview git hunk |
| `<leader>hs` | Normal | Stage git hunk |
| `<leader>hr` | Normal | Reset git hunk |
| `<leader>hb` | Normal | Blame line |
| `<leader>hd` | Normal | Diff this |

### LSP Operations
| Key | Mode | Action |
|-----|------|--------|
| `gd` | Normal | Go to definition |
| `gr` | Normal | Go to references |
| `gI` | Normal | Go to implementation |
| `K` | Normal | Hover documentation |
| `<C-k>` | Normal | Signature help |
| `<leader>rn` | Normal | Rename symbol |
| `<leader>ca` | Normal | Code actions |
| `<leader>D` | Normal | Type definition |
| `gl` | Normal | Show line diagnostics |
| `gp` | Normal | Peek definition |

### Debug Operations
| Key | Mode | Action |
|-----|------|--------|
| `<leader>xb` | Normal | Toggle breakpoint |
| `<leader>xc` | Normal | Continue/start debugging |
| `<leader>xt` | Normal | Terminate debugging |
| `<leader>xo` | Normal | Step over |
| `<leader>xi` | Normal | Step into |
| `<leader>xO` | Normal | Step out |
| `<leader>xu` | Normal | Toggle DAP UI |

### Editing Enhancements
| Key | Mode | Action |
|-----|------|--------|
| `<leader>d` | Normal/Visual | Delete without copying |
| `<leader>v` | Normal | Paste from system clipboard |
| `K` | Visual | Move selection up |
| `J` | Visual | Move selection down |
| `s` | Normal/Visual | Flash jump |
| `gcc` | Normal | Toggle line comment |
| `gbc` | Normal | Toggle block comment |

### Completion and Snippets
| Key | Mode | Action |
|-----|------|--------|
| `<Tab>` | Insert | Accept completion |
| `<C-n>` | Insert | Next completion item |
| `<C-p>` | Insert | Previous completion item |
| `<C-G>` | Insert | Accept Copilot suggestion |

### Utilities
| Key | Mode | Action |
|-----|------|--------|
| `<leader>cf` | Normal | Format buffer |
| `<leader>cs` | Visual | Screenshot code |
| `<leader>lt` | Normal | TODO Trouble |
| `<leader>lp` | Normal | Toggle diagnostics |
| `]t` | Normal | Next TODO comment |
| `[t` | Normal | Previous TODO comment |

### Diagnostic Navigation
| Key | Mode | Action |
|-----|------|--------|
| `[d` | Normal | Previous diagnostic |
| `]d` | Normal | Next diagnostic |
| `<leader>e` | Normal | Open diagnostic float |
| `<leader>q` | Normal | Open diagnostics list |

## Language Servers

### Supported Languages

| Language | Server | Features | Auto-install |
|----------|--------|----------|--------------|
| **TypeScript/JavaScript** | ts_ls | Inlay hints, auto-import, JSX | ✓ |
| **Rust** | rust-analyzer | Clippy integration, cargo support | ✓ |
| **PHP** | intelephense | Laravel stubs, comprehensive PHP support | ✓ |
| **Python** | pylsp | Multiple formatters, rope completion | ✓ |
| **Lua** | lua_ls | Neovim API support, workspace detection | ✓ |
| **HTML** | html | Emmet support, tag completion | ✓ |
| **CSS** | cssls | Property completion, validation | ✓ |
| **Tailwind CSS** | tailwindcss | Class completion, color preview | ✓ |
| **JSON** | jsonls | Schema validation, auto-completion | ✓ |
| **YAML** | yamlls | Schema support, validation | ✓ |
| **SQL** | sqlls | Multi-database support, query validation | ✓ |
| **Bash** | bashls | Script validation, completion | ✓ |
| **C/C++** | clangd | Advanced features, compile commands | ✓ |
| **Docker** | dockerls | Dockerfile support, best practices | ✓ |
| **Markdown** | marksman | Link validation, TOC generation | ✓ |
| **Astro** | astro | Component support, framework integration | ✓ |

### Server Configuration

Each language server is configured with optimal settings:

- **TypeScript**: Inlay hints enabled, import organization
- **Rust**: Clippy on save, all cargo features enabled
- **PHP**: Laravel and common framework stubs included
- **Python**: 120 character line limit, multiple linter support
- **SQL**: MySQL, PostgreSQL, and SQLite support

## Commands Reference

### LSP Commands
| Command | Description |
|---------|-------------|
| `:LspInfo` | Show attached language servers |
| `:LspRestart` | Restart language server |
| `:Mason` | Open LSP server manager |
| `:MasonUpdate` | Update installed servers |

### Plugin Management
| Command | Description |
|---------|-------------|
| `:Lazy` | Open plugin manager |
| `:Lazy update` | Update all plugins |
| `:Lazy clean` | Remove unused plugins |
| `:Lazy profile` | Profile startup time |

### Git Integration
| Command | Description |
|---------|-------------|
| `:LazyGit` | Open LazyGit interface |
| `:Gitsigns toggle_signs` | Toggle git signs |
| `:Gitsigns blame_line` | Show git blame |

### File Navigation
| Command | Description |
|---------|-------------|
| `:Telescope` | Open Telescope picker |
| `:Oil` | Open Oil file manager |
| `:TodoTrouble` | Show TODO comments |
| `:Trouble diagnostics` | Show diagnostics list |

### Debug Adapters
| Command | Description |
|---------|-------------|
| `:DapContinue` | Start/continue debugging |
| `:DapToggleBreakpoint` | Toggle breakpoint |
| `:DapTerminate` | Terminate debug session |

### Code Quality
| Command | Description |
|---------|-------------|
| `:ConformInfo` | Show formatter information |
| `:EslintFixAll` | Fix all ESLint issues |
| `:TSUpdate` | Update Treesitter parsers |

### Theme Management
| Command | Description |
|---------|-------------|
| `:colorscheme <name>` | Change color scheme |
| `:Telescope colorscheme` | Browse available themes |

## Customization Guide

### Adding New Language Servers

1. **Open Mason**: `:Mason`
2. **Install server**: Find and install your language server
3. **Add configuration**: Edit `lua/plugins/lsp/servers.lua`:

```lua
-- EXAMPLE: Adding Go language server
lspconfig.gopls.setup({
    capabilities = capabilities,
    on_attach = on_attach,
    settings = {
        gopls = {
            analyses = {
                unusedparams = true,
            },
            staticcheck = true,
        },
    },
})
```

### Adding New Plugins

1. **Choose appropriate file**: Add to relevant plugin file in `lua/plugins/`
2. **Add plugin specification**:

```lua
{
    'author/plugin-name',
    event = "BufReadPost",  -- Lazy load trigger
    config = function()
        require('plugin-name').setup({
            -- Configuration options
        })
    end,
}
```

### Customizing Keybindings

Edit `lua/core/keymaps.lua` for global keymaps or specific plugin files for plugin-related keymaps:

```lua
set_keymap('n', '<leader>custom', function()
    -- Your custom action
end, { desc = 'CUSTOM ACTION' })
```

### Theme Customization

Edit `lua/themes/init.lua` to:
- Change default colorscheme
- Customize theme settings
- Add new theme integrations

### Formatter Configuration

Edit the `formatters_by_ft` table in `lua/plugins/init.lua`:

```lua
formatters_by_ft = {
    python = { "black", "isort" },  -- Multiple formatters
    rust = { "rustfmt" },
    -- Add your language
},
```

## Troubleshooting

### Common Issues

#### Plugin Installation Fails
```bash
# Clear plugin cache and reinstall
rm -rf ~/.local/share/nvim/lazy
nvim  # Plugins will reinstall automatically
```

#### LSP Server Not Working
1. Check server status: `:LspInfo`
2. Restart server: `:LspRestart`
3. Check Mason installation: `:Mason`
4. View logs: `:lua vim.lsp.set_log_level("debug")`

#### Slow Startup
1. Profile startup: `:Lazy profile`
2. Check for heavy plugins loading early
3. Ensure proper lazy loading configuration

#### Formatting Not Working
1. Check formatter installation: `:ConformInfo`
2. Verify file type detection: `:set filetype?`
3. Check format on save setting

#### Git Signs Not Showing
1. Ensure you're in a git repository
2. Check gitsigns status: `:Gitsigns toggle_signs`
3. Verify git is in PATH

### Performance Optimization

#### Reduce Startup Time
- Use `event` triggers for plugin loading
- Avoid `require()` calls in plugin specs
- Use `cmd` for command-only plugins

#### Memory Usage
- Disable unused language servers
- Use `cond = false` to disable plugins temporarily
- Clear old undo files periodically

### Getting Help

#### Documentation
- Neovim help: `:help`
- Plugin help: `:help plugin-name`
- LSP help: `:help lsp`

#### Debugging
- Enable verbose mode: `nvim -V9nvim.log`
- Check health: `:checkhealth`
- View messages: `:messages`

#### Community Resources
- Neovim GitHub: Issues and discussions
- r/neovim: Community support
- Plugin documentation: Each plugin's README

---

## Credits

This configuration is built on the Neovim ecosystem and incorporates ideas from the community. Special thanks to:

- The Neovim core team
- All plugin authors and maintainers
- The vibrant Neovim community

**Last Updated**: January 27, 2025  
**Author**: Satanshu Mishra  
**Version**: 2.0 (Modular Architecture)