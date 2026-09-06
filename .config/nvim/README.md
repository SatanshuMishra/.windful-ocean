# Satanshu's Neovim Configuration

A comprehensive, modular Neovim configuration optimized for full-stack development with 18 language servers configured, advanced Git integration, AI assistance, and powerful development tools.

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
├── README.md               # This file
├── LICENSE.md              # MIT License (this config derives from kickstart.nvim)
├── lazy-lock.json          # Plugin version lockfile
├── .sql-formatter.json     # sql-formatter config (MySQL dialect) for SQL formatting
├── ftdetect/              # File type detection
│   └── astro.lua          # Astro framework support
├── lua/
│   ├── core/              # Core Neovim functionality
│   │   ├── options.lua    # Editor settings and vim options
│   │   ├── keymaps.lua    # Global keymaps and leader setup
│   │   ├── autocmds.lua   # Event handlers and autocommands
│   │   └── utils.lua      # Utility functions and Discord presence
│   ├── lsp/                # Language Server Protocol
│   │   ├── servers.lua    # Individual server configurations
│   │   └── keymaps.lua    # LSP-specific keybindings
│   ├── plugins/           # Plugin specifications and configurations
│   │   ├── init.lua       # Lazy.nvim setup and plugin loader
│   │   ├── lsp/          # LSP plugin spec and Mason/diagnostic setup
│   │   │   └── init.lua   # nvim-lspconfig spec, capabilities, diagnostics
│   │   ├── telescope.lua  # Fuzzy finder configuration
│   │   ├── completion.lua # Code completion and snippets
│   │   ├── treesitter.lua # Syntax highlighting
│   │   ├── debug.lua      # Debug adapters and configuration
│   │   ├── git.lua        # Git integration tools
│   │   ├── navigation.lua # File management tools
│   │   ├── ui.lua         # Visual enhancements and themes
│   │   ├── editor.lua     # Editing enhancements
│   │   ├── tools.lua      # Development tools
│   │   ├── mini.lua       # Mini.nvim suite: comment, surround, pairs, indentscope, ai, hipatterns (replaces Comment.nvim, nvim-autopairs, indent-blankline.nvim)
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

This directory is not cloned or installed on its own. It arrives at `~/.config/nvim` as a byproduct of installing the whole repository with GNU Stow — there is no separate `.config/nvim`-only install path. From the repository root:

```bash
./scripts/install_config.sh
```

See [Install](../../README.md#install) and [How it works](../../README.md#how-it-works) in the root README for the full procedure: prerequisites, what the script does, and how to confirm `~/.config/nvim` is really a tree of symlinks back into this repository rather than a copy.

Once that's done:

1. **Start Neovim**: `nvim`
2. **Wait for plugin installation**: Lazy.nvim installs all plugins automatically on first launch.
3. **Install language servers**: Open Mason with `:Mason` and install the servers you want — see [Language Servers](#language-servers).

### Environment Variables

- `NVIM_HIDDEN_PROJECT_PATH`: Path to project with redacted Discord presence

## Plugin Inventory

### Language Server Protocol

| Plugin | Purpose | Key Features |
|--------|---------|--------------|
| nvim-lspconfig | LSP client configuration | 18 language servers, auto-completion |
| mason.nvim | LSP server manager | Easy installation and management |
| fidget.nvim | LSP progress indicator | Visual feedback for LSP operations |
| neodev.nvim | Neovim Lua development | Enhanced Lua LSP for Neovim config |
| schemastore.nvim | JSON schema validation | Auto-completion for JSON files |

### Code Completion & Snippets

| Plugin | Purpose | Key Features |
|--------|---------|--------------|
| nvim-cmp | Completion engine | Intelligent code completion |
| LuaSnip | Snippet engine | Powerful snippet expansion |
| mini.pairs | Auto-close brackets | Smart bracket and quote pairing (replaces nvim-autopairs) |
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
| mini.indentscope | Indentation guides | Animated current-scope indent line (replaces indent-blankline.nvim) |
| catppuccin/nvim | Color theme | Modern, eye-friendly colorscheme |
| tokyonight.nvim | Color theme | Dark, VS Code-inspired colorscheme |
| rose-pine | Color theme | Muted, low-contrast colorscheme |
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
| mini.clue | Keybinding help | Interactive keybinding guide (replaces which-key.nvim) |
| todo-comments.nvim | TODO management | Highlight and navigate TODO comments |
| trouble.nvim | Diagnostics viewer | Better diagnostic and quickfix lists |
| lspsaga.nvim | LSP enhancements | Enhanced LSP UI and actions |
| mini.comment | Comment toggling | Line and block commenting (replaces Comment.nvim) |

## Keybinding Reference

Every Neovim keybinding is documented in one place, alongside tmux, Zsh and FZF, so the whole environment stays one unified cheatsheet: [docs/KEYBINDINGS.md](../../docs/KEYBINDINGS.md#neovim).

## Language Servers

### Supported Languages

18 language servers are configured in `lua/lsp/servers.lua`:

| Language | Server | Features |
|----------|--------|----------|
| **TypeScript/JavaScript** | ts_ls | Inlay hints, auto-import, JSX |
| **Rust** | rust-analyzer | Clippy integration, cargo support |
| **PHP** | intelephense | Laravel stubs, comprehensive PHP support |
| **Python** | pylsp | Multiple formatters, rope completion |
| **Lua** | lua_ls | Neovim API support, workspace detection |
| **HTML** | html | Tag completion, `templ` filetype support |
| **CSS** | cssls | Property completion, validation |
| **Tailwind CSS** | tailwindcss | Class completion, color preview |
| **Emmet** | emmet_ls | Abbreviation expansion for CSS, HTML, JS/TS(X), Vue, Astro |
| **JSON** | jsonls | Schema validation (via schemastore.nvim), auto-completion |
| **YAML** | yamlls | Schema support, validation |
| **SQL** | sqlls | Multi-database support, query validation |
| **ESLint** | eslint | Lint diagnostics, autofix on save |
| **Bash** | bashls | Script validation, completion |
| **C/C++** | clangd | Advanced features, compile commands |
| **Docker** | dockerls | Dockerfile support, best practices |
| **Markdown** | marksman | Link validation, TOC generation |
| **Astro** | astro | Component support, framework integration |

None of these install themselves: this config has no `mason-lspconfig.nvim` or `mason-tool-installer.nvim` bridge and `mason.nvim`'s own setup has no install-on-startup option, so every server above is added by hand — `:Mason` or `:MasonInstall <server>` — see [Adding New Language Servers](#adding-new-language-servers).

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
2. **Install server**: Find and install your language server, or run it directly: `:MasonInstall your-language-server`
3. **Add configuration**: Edit `lua/lsp/servers.lua`:

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

Keeping your own additions in a separate, importable file avoids merge conflicts with upstream changes to the existing plugin files:

```bash
touch ~/.config/nvim/lua/plugins/my-plugins.lua
```

```lua
-- ~/.config/nvim/lua/plugins/my-plugins.lua
return {
    {
        'your-username/your-plugin',
        config = function()
            require('your-plugin').setup({
                -- your configuration
            })
        end,
    },
}
```

Then import it in `lua/plugins/init.lua`:

```lua
require('lazy').setup({
    { import = "plugins.my-plugins" },  -- Add this line
    -- ... other imports
})
```

### Customizing Keybindings

Edit `lua/core/keymaps.lua` for global keymaps:

```lua
set_keymap('n', '<leader>custom', function()
    -- Your custom action
end, { desc = 'CUSTOM ACTION' })
```

For a keybinding that only makes sense while a specific plugin is loaded, add it to that plugin's own spec instead, in its `keys` table:

```lua
keys = {
    { '<leader>my', '<cmd>MyCommand<cr>', desc = 'My custom command' },
},
```

### Theme Customization

Edit `lua/themes/init.lua`:

```lua
-- Available themes: catppuccin, tokyonight, rose-pine, oxocarbon
vim.cmd.colorscheme("catppuccin-mocha")  -- Change this line
```

Use this file to change the default colorscheme, customize theme settings, or add new theme integrations. For a fully custom theme, add a new file under `lua/themes/`:

```lua
-- ~/.config/nvim/lua/themes/my-theme.lua
local M = {}

function M.setup()
    local colors = {
        bg = "#1e1e2e",
        fg = "#cdd6f4",
        -- ... more colors
    }

    vim.api.nvim_set_hl(0, "Normal", { bg = colors.bg, fg = colors.fg })
    -- ... more highlights
end

return M
```

For a consistent look across the whole terminal environment (WezTerm, tmux, Starship), see [Theming and Appearance](../../docs/CUSTOMIZATION.md#theming-and-appearance) in the customization guide.

### Formatter Configuration

Edit the `formatters_by_ft` table in `lua/plugins/init.lua`:

```lua
formatters_by_ft = {
    python = { "black", "isort" },  -- Multiple formatters
    rust = { "rustfmt" },
    -- Add your language
},
```

### Project-Specific Configuration

Neovim can load a `.nvim.lua` file from a project's root automatically, but only once [`'exrc'`](https://vimhelp.org/starting.txt.html#%27exrc%27) is turned on — it is off by default for security, since a project directory can otherwise run arbitrary commands the moment you open it there. This config does not set it, so add `vim.opt.exrc = true` (and `vim.opt.secure = true` alongside it, which disables shell and file-write commands from a local init file) to `lua/core/options.lua` first:

```lua
-- .nvim.lua in project root
vim.opt_local.shiftwidth = 2
vim.opt_local.tabstop = 2

-- Project-specific LSP settings
require('lspconfig').tsserver.setup({
    settings = {
        typescript = {
            preferences = {
                importModuleSpecifier = "relative"
            }
        }
    }
})
```

## Troubleshooting

### Common Issues

#### Neovim Won't Start
```bash
# Check Neovim version (needs 0.9+)
nvim --version

# Start with minimal config to test whether the problem is this config
nvim --clean

# Check for syntax errors in this config
nvim --headless -c 'luafile ~/.config/nvim/init.lua' -c 'qa'

# Clear plugin cache and reinstall
rm -rf ~/.local/share/nvim/lazy
rm -rf ~/.local/state/nvim/lazy
nvim  # Will reinstall plugins
```

#### Plugin Installation Fails
```bash
# Clear plugin cache and reinstall
rm -rf ~/.local/share/nvim/lazy
nvim  # Plugins will reinstall automatically
```

If Lazy.nvim itself is missing or corrupted:
```bash
rm -rf ~/.local/share/nvim/lazy/lazy.nvim
nvim  # Will auto-install

# If that fails, install manually
git clone --filter=blob:none --branch=stable \
  https://github.com/folke/lazy.nvim.git \
  ~/.local/share/nvim/lazy/lazy.nvim
```

#### Plugins Not Loading
1. Check plugin manager status: `:Lazy`
2. Update all plugins: `:Lazy update`
3. Check for plugin errors: `:Lazy log`
4. Clean and reinstall a problem plugin: `:Lazy clean` then `:Lazy install`
5. Check overall health: `:checkhealth`

#### LSP Server Not Working
1. Check server status: `:LspInfo`
2. Restart server: `:LspRestart`
3. Check Mason installation: `:Mason`
4. Manually install a server: `:MasonInstall typescript-language-server`
5. Check LSP health: `:checkhealth lsp`
6. View logs: `:lua vim.lsp.set_log_level("debug")`

#### Slow Startup
1. Profile startup: `:Lazy profile`
2. Or profile with Neovim's own timer: `nvim --startuptime startup.log` and inspect `startup.log` for slow components
3. Check for heavy plugins loading early
4. Ensure proper lazy loading configuration
5. Look for unusually large config files: `find ~/.config/nvim -name "*.lua" -exec wc -l {} +`

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

```lua
-- Only load plugins when needed
{
    'expensive-plugin',
    lazy = true,
    event = 'BufReadPost',
    cmd = { 'PluginCommand' },
    ft = { 'javascript', 'typescript' },
}
```

#### Memory Usage
- Disable unused language servers
- Use `cond = false` to disable plugins temporarily
- Clear old undo files periodically

```lua
-- In lua/core/options.lua
vim.opt.backup = false      -- Disable backup files
vim.opt.writebackup = false -- Disable backup during write
vim.opt.swapfile = false    -- Disable swap files
```

### Getting Help

#### Documentation
- Neovim help: `:help`
- Plugin help: `:help plugin-name`
- LSP help: `:help lsp`

#### Debugging
- Enable verbose mode: `nvim -V9nvim.log`
- Check overall health: `:checkhealth` (or headless: `nvim -c 'checkhealth' -c 'qall'`)
- Check a specific component: `:checkhealth nvim`, `:checkhealth lsp`, `:checkhealth treesitter`, `:checkhealth telescope`
- View messages: `:messages`

#### Community Resources
- Neovim GitHub: Issues and discussions
- r/neovim: Community support
- Plugin documentation: Each plugin's README

For install, stow, shell, font and other system-level problems that are not specific to Neovim, see [docs/TROUBLESHOOTING.md](../../docs/TROUBLESHOOTING.md).

---

## Credits

This configuration is built on the Neovim ecosystem and incorporates ideas from the community. Special thanks to:

- The Neovim core team
- All plugin authors and maintainers
- The vibrant Neovim community

**Last Updated**: January 27, 2025  
**Author**: Satanshu Mishra  
**Version**: 2.0 (Modular Architecture)