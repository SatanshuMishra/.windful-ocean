--[[
===============================================================================
                        SATANSHU'S NEOVIM CONFIGURATION
===============================================================================

AUTHOR: Satanshu Mishra
DESCRIPTION: A comprehensive Neovim configuration optimized for full-stack development
LAST UPDATED: 2025-01-27

ORGANIZATION:
This configuration is organized into modular components:

├── lua/
│   ├── core/               # Core Neovim functionality
│   │   ├── options.lua     # vim.opt settings & variables
│   │   ├── keymaps.lua     # Global keymaps & leader setup
│   │   ├── autocmds.lua    # Autocommands & event handlers
│   │   └── utils.lua       # Utility functions
│   ├── plugins/            # Plugin specifications & configurations
│   │   ├── init.lua        # Lazy.nvim setup & plugin loader
│   │   ├── telescope.lua   # Fuzzy finder & extensions
│   │   ├── lsp/           # Language Server Protocol
│   │   │   ├── init.lua   # LSP setup & capabilities
│   │   │   ├── servers.lua # Server-specific configs
│   │   │   └── keymaps.lua # LSP keymaps
│   │   ├── completion.lua  # nvim-cmp & sources
│   │   ├── treesitter.lua  # Syntax highlighting
│   │   ├── debug.lua       # Debug adapters
│   │   ├── git.lua         # Git integration
│   │   ├── navigation.lua  # File management
│   │   ├── ui.lua          # Visual enhancements
│   │   ├── editor.lua      # Editing enhancements
│   │   ├── tools.lua       # Development tools
│   │   ├── utilities.lua   # Utility plugins
│   │   └── ai.lua          # AI assistance
│   └── themes/
│       └── init.lua        # Theme configuration

FEATURES:
- LSP support for 15+ languages (TypeScript, Rust, PHP, Python, etc.)
- Complete SQL support with multi-dialect detection
- Advanced Git integration with LazyGit and Gitsigns
- AI assistance with GitHub Copilot
- File navigation with Telescope, Oil, and Harpoon
- Discord Rich Presence with Tmux session awareness
- Debug adapter protocol (DAP) for multiple languages
- Code formatting, linting, and syntax highlighting
- Screenshot functionality for code sharing

ENVIRONMENT VARIABLES:
- NVIM_HIDDEN_PROJECT_PATH: Path to project with redacted Discord presence
]]

-- ============================================================================
--                              CORE MODULES
-- ============================================================================

-- LOAD CORE CONFIGURATION MODULES
require('core.options')    -- Neovim options and settings
require('core.keymaps')    -- Global keymaps and leader setup
require('core.autocmds')   -- Autocommands and event handlers

-- LOAD LAZY.NVIM PLUGIN MANAGER AND ALL PLUGINS
require('plugins')

-- LOAD THEME CONFIGURATION
require('themes')

-- ============================================================================
--                                  END
-- ============================================================================