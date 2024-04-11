-- Set <space> as the leader key
-- See `:help mapleader`
--  NOTE: Must happen before plugins are required (otherwise wrong leader will be used)
--

-- Test Comment

-- After loading your colorscheme:
vim.api.nvim_set_hl(0, "NormalNC", { link = "Normal" })

-- Terminal: Slightly darker gray
vim.api.nvim_set_hl(0, "NormalNC", { ctermbg = 238 })

-- GUI: A darker shade of your colorscheme's background
if vim.g.loaded_neovim_guifile == 1 then
    vim.api.nvim_set_hl(0, "NormalNC", { guibg = "#282828" })
end

-- GUI: SET LINE NUMBER BACKGROUND TO TRANSPARENT
vim.cmd("hi LineNr guifg=#ffffff guibg=NONE")
vim.cmd.hi("LineNr guibg=NONE guifg=#FFFFFF")

-- INFORMATION:

function split(pString, pPattern)
    local Table = {} -- NOTE: use {n = 0} in Lua-5.0
    local fpat = "(.-)" .. pPattern
    local last_end = 1
    local s, e, cap = pString:find(fpat, 1)
    while s do
        if s ~= 1 or cap ~= "" then
            table.insert(Table, cap)
        end
        last_end = e + 1
        s, e, cap = pString:find(fpat, last_end)
    end
    if last_end <= #pString then
        cap = pString:sub(last_end)
        table.insert(Table, cap)
    end
    return Table
end

-- Cast a magic spell to add relative line numbers to Netrw
vim.cmd([[let g:netrw_bufsettings="noma nomod nu nobl nowrap ro rnu"]])

vim.api.nvim_create_autocmd({ "VimEnter" }, {
    command = "highlight Normal guibg=NONE ctermbg=NONE"
})
vim.api.nvim_create_autocmd({ "VimEnter" }, {
    command = "highlight SignColumn guibg=NONE ctermbg=NONE"
})
-- Do the above green and below red!!
vim.api.nvim_create_autocmd({ "VimEnter" }, {
    -- command = "highlight LineNr guifg=#CCCCCC ctermfg=#FFFFFF"
    command = "highlight LineNr guifg=#CCCCCC"
})

vim.api.nvim_create_autocmd({ "VimLeave" }, {
    command = "silent !wezterm cli set-tab-title $(basename \"$PWD\")"
})

vim.api.nvim_create_autocmd({ "BufEnter" }, {
    pattern = "*.*",
    callback = function()
        local split = {}
        for segment in string.gmatch(vim.api.nvim_buf_get_name(0), "[^/]+") do
            table.insert(split, segment)
        end

        local last = "/" .. split[#split - 1] .. "/" .. split[#split]

        vim.cmd("silent !wezterm cli set-tab-title " .. last)
    end
})

-- VARIABLES

vim.g.mapleader = ' '
vim.g.maplocalleader = ' '
local setopt = vim.opt

setopt.tabstop = 4
setopt.softtabstop = 4
setopt.shiftwidth = 4

-- Editor relative line numbers
vim.wo.number = true
vim.wo.relativenumber = true

-- Join lines keeping cursor position
vim.keymap.set("n", "J", "mzJ`z")
-- Page up/down PLUS center screen
vim.keymap.set("n", "<C-d>", "<C-d>zz")
vim.keymap.set("n", "<C-u>", "<C-u>zz")
-- Add line-moving to Shift-J and Shift-K during VISUAL mode
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv", { desc = "Move line down 1" })
vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv", { desc = "Move line up 1" })

vim.keymap.set('n', '<leader>fs', vim.cmd.Ex, { desc = "Open File System (netrw)" })
-- [[ Install `lazy.nvim` plugin manager ]]
--    https://github.com/folke/lazy.nvim
--    `:help lazy.nvim.txt` for more info
local lazypath = vim.fn.stdpath 'data' .. '/lazy/lazy.nvim'
if not vim.loop.fs_stat(lazypath) then
    vim.fn.system {
        'git',
        'clone',
        '--filter=blob:none',
        'https://github.com/folke/lazy.nvim.git',
        '--branch=stable', -- latest stable release
        lazypath,
    }
end
vim.opt.rtp:prepend(lazypath)

-- [[ Configure plugins ]]
-- NOTE: Here is where you install your plugins.
--  You can configure plugins using the `config` key.

require('lazy').setup({

    'virchau13/tree-sitter-astro',

    --  NOTE: RESPONSIBLE FOR THE UPDATED NVIM-TREE WITH ICONS
    {
        'stevearc/oil.nvim',
        opts = {},
        -- Optional dependencies
        dependencies = { "nvim-tree/nvim-web-devicons" },
        config = function()
            -- Configure oil.nvim
            require("oil").setup({
                skip_confirm_for_simple_edits = false,
                view_options = {
                    -- Show files and directories that start with "."
                    show_hidden = true,
                    -- This function defines what is considered a "hidden" file
                    is_hidden_file = function(name, bufnr)
                        return vim.startswith(name, ".") or vim.startswith(name, 'node_modules')
                    end,
                },
            })
            require("nvim-web-devicons").setup {
                strict = true,
                override_by_extension = {
                    ["astro"] = {
                        icon = "",
                        color = "#f1502f",
                        name = "Astro",
                    },
                },
            }
        end,
    },

    'tpope/vim-fugitive',
    'tpope/vim-rhubarb',

    -- Detect tabstop and shiftwidth automatically
    -- 'tpope/vim-sleuth',
    'prettier/vim-prettier',

    -- COLOR HIGHLIGHTING FOR NVIM
    'chrisbra/Colorizer',
    {
        'github/copilot.vim',
        config = function()
            vim.keymap.set('i', '<C-G>', 'copilot#Accept("<CR>")', {
                expr = true,
                replace_keycodes = false
            })
            vim.g.copilot_no_tab_map = true
        end,
    },
    -- NOTE: This is where your plugins related to LSP can be installed.
    --  The configuration is done below. Search for lspconfig to find it below.
    {
        -- LSP Configuration & Plugins
        'neovim/nvim-lspconfig',
        config = function()
            require('lspconfig').rust_analyzer.setup {}
        end,
        dependencies = {
            -- Automatically install LSPs to stdpath for neovim
            'williamboman/mason.nvim',
            'williamboman/mason-lspconfig.nvim',

            -- Useful status updates for LSP
            -- NOTE: `opts = {}` is the same as calling `require('fidget').setup({})`
            { 'j-hui/fidget.nvim', tag = 'legacy', opts = {} },

            -- Additional lua configuration, makes nvim stuff amazing!
            'folke/neodev.nvim',
        },
    },

    {
        -- Autocompletion
        'hrsh7th/nvim-cmp',
        config = function()
            vim.o.completeopt = "menuone,noselect,preview"

            local cmp = require('cmp')
            cmp.setup({
                mapping = cmp.mapping.preset.insert({
                    ['<Tab>'] = cmp.mapping.confirm({ select = true }),
                })
            })
        end,
        dependencies = {
            -- Snippet Engine & its associated nvim-cmp source
            'L3MON4D3/LuaSnip',
            'saadparwaiz1/cmp_luasnip',

            -- Adds LSP completion capabilities
            'hrsh7th/cmp-nvim-lsp',

            -- Adds a number of user-friendly snippets
            'rafamadriz/friendly-snippets',
        },
    },

    -- Hover Tooltip Plugin
    {
        "lewis6991/hover.nvim",
        config = function()
            require("hover").setup {
                init = function()
                    -- Require providers
                    require("hover.providers.lsp")
                    -- require('hover.providers.gh')
                    -- require('hover.providers.gh_user')
                    -- require('hover.providers.jira')
                    -- require('hover.providers.man')
                    -- require('hover.providers.dictionary')
                end,
                preview_opts = {
                    border = 'single'
                },
                -- Whether the contents of a currently open hover window should be moved
                -- to a :h preview-window when pressing the hover keymap.
                preview_window = false,
                title = true,
                mouse_providers = {
                    'LSP'
                },
                mouse_delay = 1000
            }
            -- vim.keymap.del("n", "H")
            -- Setup keymaps
            vim.keymap.set("n", "H", require("hover").hover, { desc = "hover.nvim" })
            vim.keymap.set("n", "gH", require("hover").hover_select, { desc = "hover.nvim (select)" })

            -- Mouse support
            -- vim.keymap.set('n', '<MouseMove>', require('hover').hover_mouse, { desc = "hover.nvim (mouse)" })
            -- vim.o.mousemoveevent = true
        end
    },

    -- Autoclose Plugin
    {
        'windwp/nvim-autopairs',
        event = "InsertEnter",
        opts = {},
        dependencies = {
            'hrsh7th/nvim-cmp',
        },
    },

    {
        'kaarmu/typst.vim',
        ft = 'typst',
        lazy = false,
    },

    -- Useful plugin to show you pending keybinds.
    -- FOLKE
    { 'folke/which-key.nvim',  opts = {} },
    {
        "folke/trouble.nvim",
        dependencies = { "nvim-tree/nvim-web-devicons" },
        opts = {
            --
            -- your configuration comes here
            -- or leave it empty to use the default settings
            -- refer to the configuration section below
        },
        config = function()
            vim.keymap.set("n", "<leader>lp", "<cmd>Trouble workspace_diagnostics<cr>",
                { desc = "[L]ist [P]roblems" })
        end,
    },
    {
        "folke/todo-comments.nvim",
        dependencies = { "nvim-lua/plenary.nvim" },
        -- opts = ,
        -- RANDOM:
        config = function()
            require("todo-comments").setup({
                signs = true,      -- show icons in the signs column
                sign_priority = 8, -- sign priority
                -- keywords recognized as todo comments
                keywords = {
                    FIX = {
                        icon = " ", -- icon used for the sign, and in search results
                        color = "error", -- can be a hex color, or a named color (see below)
                        alt = { "FIXME", "BUG", "FIXIT", "ISSUE" }, -- a set of other keywords that all map to this FIX keywords
                        -- signs = false, -- configure signs for some keywords individually
                    },
                    TODO = { icon = "✓", color = "info" },
                    DEBUG = { icon = " ", color = "warning" },
                    WARN = { icon = " ", color = "warning", alt = { "WARNING", "XXX" } },
                    PERF = { icon = " ", alt = { "OPTIM", "PERFORMANCE", "OPTIMIZE" } },
                    DOCUMENTATION = { " ", color = "hint", alt = { "INFO" } },
                    TEST = { icon = "⏲ ", color = "test", alt = { "TESTING", "PASSED", "FAILED" } },
                    INFORMATION = { icon = "󰋼", color = "information" },
                },
                gui_style = {
                    fg = "NONE",       -- The gui style to use for the fg highlight group.
                    bg = "BOLD",       -- The gui style to use for the bg highlight group.
                },
                merge_keywords = true, -- when true, custom keywords will be merged with the defaults
                -- highlighting of the line containing the todo comment
                -- * before: highlights before the keyword (typically comment characters)
                -- * keyword: highlights of the keyword
                -- * after: highlights after the keyword (todo text)
                highlight = {
                    multiline = true,                -- enable multine todo comments
                    multiline_pattern = "^.",        -- lua pattern to match the next multiline from the start of the matched keyword
                    multiline_context = 10,          -- extra lines that will be re-evaluated when changing a line
                    before = "",                     -- "fg" or "bg" or empty
                    keyword = "wide",                -- "fg", "bg", "wide", "wide_bg", "wide_fg" or empty. (wide and wide_bg is the same as bg, but will also highlight surrounding characters, wide_fg acts accordingly but with fg)
                    after = "fg",                    -- "fg" or "bg" or empty
                    pattern = [[.*<(KEYWORDS)\s*:]], -- pattern or table of patterns, used for highlighting (vim regex)
                    comments_only = true,            -- uses treesitter to match keywords in comments only
                    max_line_len = 400,              -- ignore lines longer than this
                    exclude = {},                    -- list of file types to exclude highlighting
                },
                -- list of named colors where we try to extract the guifg from the
                -- list of highlight groups or use the hex color if hl not found as a fallback
                -- INFO:
                colors = {
                    error = { "DiagnosticError", "ErrorMsg", "#DC2626" },
                    warning = { "DiagnosticWarn", "WarningMsg", "#FBBF24" },
                    info = { "DiagnosticInfo", "#2563EB" },
                    hint = { "DiagnosticHint", "#10B981" },
                    default = { "Identifier", "#7C3AED" },
                    test = { "Identifier", "#FF00FF" },
                    information = { "#0060DF" }
                },
                search = {
                    command = "rg",
                    args = {
                        "--color=never",
                        "--no-heading",
                        "--with-filename",
                        "--line-number",
                        "--column",
                    },
                    -- regex that will be used to match keywords.
                    -- don't replace the (KEYWORDS) placeholder
                    pattern = [[\b(KEYWORDS):]], -- ripgrep regex
                    -- pattern = [[\b(KEYWORDS)\b]], -- match without the extra colon. You'll likely get false positives
                },
            })

            vim.keymap.set("n", "]t", function()
                require("todo-comments").jump_next()
            end, { desc = "Next todo comment" })

            vim.keymap.set("n", "[t", function()
                require("todo-comments").jump_prev()
            end, { desc = "Previous todo comment" })

            vim.keymap.set("n", "<leader>lt", "<cmd>TodoTrouble<cr>", { desc = "[L]ook at [t]odos" })
            vim.keymap.set("n", "<leader>lT", "<cmd>TodoTelescope<cr>", { desc = "[L]ook at todos using [T]elescope" })
        end
    },
    {
        'theprimeagen/harpoon',
        config = function()
            local mark = require("harpoon.mark")
            local ui = require("harpoon.ui")
            vim.keymap.set("n", "<leader>fa", mark.add_file, { desc = "Add [A] file to Harpoon" })
            vim.keymap.set("n", "<C-e>", ui.toggle_quick_menu, { desc = "Toggle Harpoon [E]xplorer" })
            vim.keymap.set("n", "<leader>fl", ui.toggle_quick_menu, { desc = "Toggle Harpoon [L]ist" })

            vim.keymap.set("n", "<C-1>", function() ui.nav_file(1) end, { desc = "Open First Harpooned File" })
            vim.keymap.set("n", "<C-2>", function() ui.nav_file(2) end, { desc = "Open Second Harpooned File" })
            vim.keymap.set("n", "<C-3>", function() ui.nav_file(3) end, { desc = "Open Third Harpooned File" })
            vim.keymap.set("n", "<C-4>", function() ui.nav_file(4) end, { desc = "Open Fourth Harpooned File" })

            -- vim.keymap.set("n", "<C-a>", function() ui.nav_file(1) end, { desc = "Open First Harpooned File" })
            -- vim.keymap.set("n", "<C-d>", function() ui.nav_file(3) end, { desc = "Open Third Harpooned File" })
            -- vim.keymap.set("n", "<C-f>", function() ui.nav_file(4) end, { desc = "Open Fourth Harpooned File" })
            vim.keymap.set("n", "<leader>o1", function() ui.nav_file(1) end, { desc = "Open First Harpooned File" })
            vim.keymap.set("n", "<leader>o2", function() ui.nav_file(2) end, { desc = "Open Second Harpooned File" })
            vim.keymap.set("n", "<leader>o3", function() ui.nav_file(3) end, { desc = "Open Third Harpooned File" })
            vim.keymap.set("n", "<leader>o4", function() ui.nav_file(4) end, { desc = "Open Fourth Harpooned File" })
        end,
    },
    {
        -- Adds git related signs to the gutter, as well as utilities for managing changes
        'lewis6991/gitsigns.nvim',
        opts = {
            -- See `:help gitsigns.txt`
            signs = {
                add = { text = '+' },
                change = { text = '~' },
                delete = { text = '_' },
                topdelete = { text = '^' },
                changedelete = { text = '~' },
            },
            on_attach = function(bufnr)
                vim.keymap.set('n', '<leader>hp', require('gitsigns').preview_hunk,
                    { buffer = bufnr, desc = 'Preview git hunk' })

                -- don't override the built-in and fugitive keymaps
                local gs = package.loaded.gitsigns
                vim.keymap.set({ 'n', 'v' }, ']c', function()
                    if vim.wo.diff then
                        return ']c'
                    end
                    vim.schedule(function()
                        gs.next_hunk()
                    end)
                    return '<Ignore>'
                end, { expr = true, buffer = bufnr, desc = 'Jump to next hunk' })
                vim.keymap.set({ 'n', 'v' }, '[c', function()
                    if vim.wo.diff then
                        return '[c'
                    end
                    vim.schedule(function()
                        gs.prev_hunk()
                    end)
                    return '<Ignore>'
                end, { expr = true, buffer = bufnr, desc = 'Jump to previous hunk' })
            end,
        },
    },

    --  NOTE: NVIM HIGHLIGHT COLORS
    --  This plugin highlights colors within the editor.

    {
        "brenoprata10/nvim-highlight-colors",
        opts = {
            ---Render style
            ---@usage 'background'|'foreground'|'virtual'
            render = 'background',

            ---Set virtual symbol (requires render to be set to 'virtual')
            virtual_symbol = '■',

            ---Highlight named colors, e.g. 'green'
            enable_named_colors = true,

            ---Highlight tailwind colors, e.g. 'bg-blue-500'
            enable_tailwind = true,

            ---Set custom colors
            ---Label must be properly escaped with '%' to adhere to `string.gmatch`
            --- :help string.gmatch
            custom_colors = {
                { label = '%-%-theme%-primary%-color',   color = '#0f1219' },
                { label = '%-%-theme%-secondary%-color', color = '#5a5d64' },
            }
        }
    },

    --  NOTE: SILICON CODE SNAPSHOT
    --  This plugin takes a screenshot of the selected code and copies it to clipboard. Activate using `<leader>cs`.

    {
        "michaelrommel/nvim-silicon",
        lazy = true,
        cmd = "Silicon",
        init = function()
            local wk = require("which-key")
            wk.register({
                ['<leader>c'] = { name = '[C]ode', _ = 'which_key_ignore' },
                ["<leader>cs"] = { ":Silicon<CR>", "[S]napshot" }
            }, { mode = "v" })
        end,
        config = function()
            require("silicon").setup({
                font = "Hasklig=34;Noto Color Emoji=34",
                to_clipboard = true,
                theme = "Coldark-Dark",
                background = "#8dd9d5",
                window_title = function()
                    return vim.fn.fnamemodify(
                        vim.api.nvim_buf_get_name(vim.api.nvim_get_current_buf()), ":t"
                    )
                end
            })
        end
    },

    --  NOTE: NVIM THEME SETTINGS
    --  This section hold all the installed themes. Use `:Themery` to live preview the installed themes. (Theme needs to be set manually).

    {
        "cocopon/iceberg.vim",
        name = "iceberg",
        priority = 1000
    },
    {
        "casonadams/nord.vim",
        name = "nord",
        priority = 1000
    },
    {
        "rose-pine/neovim",
        name = "rose-pine",
        priority = 1000

    },
    {
        'catppuccin/nvim',
        name = 'catppuccin',
        priority = 1000
    },
    {
        "embark-theme/vim",
        name = "embark",
        priority = 1000
    },
    {
        "FrenzyExists/aquarium-vim",
        name = "aquarium",
        priority = 1000
    },
    {
        "ayu-theme/ayu-vim",
        name = "ayu",
        priority = 1000
    },
    {
        "yorickpeterse/vim-paper",
        name = "paper",
        priority = 1000
    },
    {
        "bluz71/vim-nightfly-colors",
        name = "nightfly",
        priority = 1000
    },
    {
        "barrientosvctor/abyss.nvim",
        name = "abyss",
        priority = 1000
    },
    {
        "folke/tokyonight.nvim",
        name = "tokoyonight",
        priority = 1000,

        --  NOTE: CHANGE THEME BY CHANGING THE THEME MENTIONED INSIDE vim.cmd COMMAND

        config = function()
            vim.cmd([[:colorscheme abyss]])
        end,
    },

    --  NOTE: LUALINE SETTINGS

    {
        "nvim-lualine/lualine.nvim",
        opts = {
            options = {
                icons_enabled = true,
                theme = "embark",
                component_separators = "|",
                section_separators = "",
            },
        },
    },

    {
        "zaldih/themery.nvim",
        opts = {
            themes = {
                'nightfly',
                'paper',
                'ayu',
                'aquarium',
                'embark',
                'catppuccin-frappe',
                'catppuccin-latte',
                'catppuccin-macchiato',
                'catppuccin-mocha',
                'iceberg',
                'nord',
                'nord-light',
                'rose-pine',
                'rose-pine-dawn',
                'rose-pine-main',
                'rose-pine-moon',
                'tokyonight',
                'tokyonight-day',
                'tokyonight-moon ',
                'tokyonight-night ',
                'tokyonight-storm ',
            },
            -- Your list of installed colorschemes
            themeConfigFile = "~/.config/nvim/lua/settings/theme.lua",
            -- Described below
            livePreview = true,
            -- Apply theme while browsing. Default to true.
        }
    },

    -- NVimTree File Directory Navigator
    -- Add Setup Here
    {
        -- Add indentation guides even on blank lines
        'lukas-reineke/indent-blankline.nvim',
        -- Enable `lukas-reineke/indent-blankline.nvim`
        -- See `:help ibl`
        main = 'ibl',
        opts = {},
    },

    -- "gc" to comment visual regions/lines
    { 'numToStr/Comment.nvim', opts = {} },

    -- Fuzzy Finder (files, lsp, etc)
    {
        'nvim-telescope/telescope.nvim',
        branch = '0.1.x',
        dependencies = {
            'nvim-lua/plenary.nvim',
            -- Fuzzy Finder Algorithm which requires local dependencies to be built.
            -- Only load if `make` is available. Make sure you have the system
            -- requirements installed.
            {
                'nvim-telescope/telescope-fzf-native.nvim',
                -- NOTE: If you are having trouble with this installation,
                --       refer to the README for telescope-fzf-native for more instructions.
                build = 'make',
                cond = function()
                    return vim.fn.executable 'make' == 1
                end,
            },
        },
    },

    {
        -- Highlight, edit, and navigate code
        'nvim-treesitter/nvim-treesitter',
        dependencies = {
            'nvim-treesitter/nvim-treesitter-textobjects',
        },
        build = ':TSUpdate',
    },

    --  {
    --      'windwp/nvim-ts-autotag',
    --      config = {
    --          require('nvim-ts-autotag').setup()
    --      },
    --  },

    -- NOTE: Next Step on Your Neovim Journey: Add/Configure additional "plugins" for kickstart
    --       These are some example plugins that I've included in the kickstart repository.
    --       Uncomment any of the lines below to enable them.
    -- require 'kickstart.plugins.autoformat',
    -- require 'kickstart.plugins.debug',

    -- NOTE: The import below can automatically add your own plugins, configuration, etc from `lua/custom/plugins/*.lua`
    --    You can use this folder to prevent any conflicts with this init.lua if you're interested in keeping
    --    up-to-date with whatever is in the kickstart repo.
    --    Uncomment the following line and add your plugins to `lua/custom/plugins/*.lua` to get going.
    --
    --    For additional information see: https://github.com/folke/lazy.nvim#-structuring-your-plugins
    -- { import = 'custom.plugins' },
}, {})

-- [[ Setting options ]]
-- See `:help vim.o`
-- NOTE: You can change these options as you wish!

local cmp_autopairs = require('nvim-autopairs.completion.cmp')
local cmp = require('cmp')
cmp.event:on(
    'confirm_done',
    cmp_autopairs.on_confirm_done()
)

require 'nvim-treesitter.configs'.setup {
    autotag = {
        enable = true,
    }
}
-- Set highlight on search
vim.o.hlsearch = false

-- Make line numbers default
vim.wo.relativenumber = true

-- Enable mouse mode
vim.o.mouse = 'a'

-- Sync clipboard between OS and Neovim.
--  Remove this option if you want your OS clipboard to remain independent.
--  See `:help 'clipboard'`
vim.o.clipboard = 'unnamedplus'

-- Enable break indent
vim.o.breakindent = true

-- Save undo history
vim.o.undofile = true

-- Case-insensitive searching UNLESS \C or capital in search
vim.o.ignorecase = true
vim.o.smartcase = true

-- Keep signcolumn on by default
vim.wo.signcolumn = 'yes'

-- Decrease update time
vim.o.updatetime = 250
vim.o.timeoutlen = 300

-- Set completeopt to have a better completion experience
vim.o.completeopt = 'menuone,noselect'

-- NOTE: You should make sure your terminal supports this
vim.o.termguicolors = true

-- [[ Basic Keymaps ]]
-- CUSTOM KEYMAPS

-- Keymaps for better default experience
-- See `:help vim.keymap.set()`
vim.keymap.set({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })

-- Remap for dealing with word wrap
vim.keymap.set('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
vim.keymap.set('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })

-- Diagnostic keymaps
vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, { desc = 'Go to previous diagnostic message' })
vim.keymap.set('n', ']d', vim.diagnostic.goto_next, { desc = 'Go to next diagnostic message' })
vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { desc = 'Open floating diagnostic message' })
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostics list' })

-- [[ Highlight on yank ]]
-- See `:help vim.highlight.on_yank()`
local highlight_group = vim.api.nvim_create_augroup('YankHighlight', { clear = true })
vim.api.nvim_create_autocmd('TextYankPost', {
    callback = function()
        vim.highlight.on_yank()
    end,
    group = highlight_group,
    pattern = '*',
})

-- [[ Configure Telescope ]]
-- See `:help telescope` and `:help telescope.setup()`
require('telescope').setup {
    defaults = {
        mappings = {
            i = {
                ['<C-u>'] = false,
                ['<C-d>'] = false,
            },
        },
    },
}

-- Enable telescope fzf native, if installed
pcall(require('telescope').load_extension, 'fzf')

-- Telescope live_grep in git root
-- Function to find the git root directory based on the current buffer's path
local function find_git_root()
    -- Use the current buffer's path as the starting point for the git search
    local current_file = vim.api.nvim_buf_get_name(0)
    local current_dir
    local cwd = vim.fn.getcwd()
    -- If the buffer is not associated with a file, return nil
    if current_file == "" then
        current_dir = cwd
    else
        -- Extract the directory from the current file's path
        current_dir = vim.fn.fnamemodify(current_file, ":h")
    end

    -- Find the Git root directory from the current file's path
    local git_root = vim.fn.systemlist("git -C " .. vim.fn.escape(current_dir, " ") .. " rev-parse --show-toplevel")[1]
    if vim.v.shell_error ~= 0 then
        print("Not a git repository. Searching on current working directory")
        return cwd
    end
    return git_root
end

-- Custom live_grep function to search in git root
local function live_grep_git_root()
    local git_root = find_git_root()
    if git_root then
        require('telescope.builtin').live_grep({
            search_dirs = { git_root },
        })
    end
end

vim.api.nvim_create_user_command('LiveGrepGitRoot', live_grep_git_root, {})

-- See `:help telescope.builtin`
vim.keymap.set('n', '<leader>?', require('telescope.builtin').oldfiles, { desc = '[?] Find recently opened files' })
vim.keymap.set('n', '<leader><space>', require('telescope.builtin').buffers, { desc = '[ ] Find existing buffers' })
vim.keymap.set('n', '<leader>/', function()
    -- You can pass additional configuration to telescope to change theme, layout, etc.
    require('telescope.builtin').current_buffer_fuzzy_find(require('telescope.themes').get_dropdown {
        winblend = 10,
        previewer = false,
    })
end, { desc = '[/] Fuzzily search in current buffer' })

vim.keymap.set('n', '<leader>gf', require('telescope.builtin').git_files, { desc = 'Search [G]it [F]iles' })
vim.keymap.set('n', '<leader>sf', require('telescope.builtin').find_files, { desc = '[S]earch [F]iles' })
vim.keymap.set('n', '<leader>sh', require('telescope.builtin').help_tags, { desc = '[S]earch [H]elp' })
vim.keymap.set('n', '<leader>sw', require('telescope.builtin').grep_string, { desc = '[S]earch current [W]ord' })
vim.keymap.set('n', '<leader>sg', require('telescope.builtin').live_grep, { desc = '[S]earch by [G]rep' })
vim.keymap.set('n', '<leader>sG', ':LiveGrepGitRoot<cr>', { desc = '[S]earch by [G]rep on Git Root' })
vim.keymap.set('n', '<leader>sd', require('telescope.builtin').diagnostics, { desc = '[S]earch [D]iagnostics' })
vim.keymap.set('n', '<leader>sr', require('telescope.builtin').resume, { desc = '[S]earch [R]esume' })
vim.keymap.set('n', '<leader>v', '"+p', { desc = 'Paste from clipboard' })

-- [[ Configure Treesitter ]]
-- See `:help nvim-treesitter`
-- Defer Treesitter setup after first render to improve startup time of 'nvim {filename}'
vim.defer_fn(function()
    require('nvim-treesitter.configs').setup {
        -- Add languages to be installed here that you want installed for treesitter
        ensure_installed = { 'c', 'cpp', 'go', 'lua', 'python', 'rust', 'tsx', 'javascript', 'typescript', 'vimdoc', 'vim', 'bash' },

        -- Autoinstall languages that are not installed. Defaults to false (but you can change for yourself!)
        auto_install = false,

        highlight = { enable = true },
        indent = { enable = true },
        incremental_selection = {
            enable = true,
            keymaps = {
                init_selection = '<c-space>',
                node_incremental = '<c-space>',
                scope_incremental = '<c-s>',
                node_decremental = '<M-space>',
            },
        },
        textobjects = {
            select = {
                enable = true,
                lookahead = true, -- Automatically jump forward to textobj, similar to targets.vim
                keymaps = {
                    -- You can use the capture groups defined in textobjects.scm
                    ['aa'] = '@parameter.outer',
                    ['ia'] = '@parameter.inner',
                    ['af'] = '@function.outer',
                    ['if'] = '@function.inner',
                    ['ac'] = '@class.outer',
                    ['ic'] = '@class.inner',
                },
            },
            move = {
                enable = true,
                set_jumps = true, -- whether to set jumps in the jumplist
                goto_next_start = {
                    [']m'] = '@function.outer',
                    [']]'] = '@class.outer',
                },
                goto_next_end = {
                    [']M'] = '@function.outer',
                    [']['] = '@class.outer',
                },
                goto_previous_start = {
                    ['[m'] = '@function.outer',
                    ['[['] = '@class.outer',
                },
                goto_previous_end = {
                    ['[M'] = '@function.outer',
                    ['[]'] = '@class.outer',
                },
            },
            swap = {
                enable = true,
                swap_next = {
                    ['<leader>a'] = '@parameter.inner',
                },
                swap_previous = {
                    ['<leader>A'] = '@parameter.inner',
                },
            },
        },
    }
end, 0)

-- [[ Configure LSP ]]
--  This function gets run when an LSP connects to a particular buffer.
local on_attach = function(_, bufnr)
    -- NOTE: Remember that lua is a real programming language, and as such it is possible
    -- to define small helper and utility functions so you don't have to repeat yourself
    -- many times.
    --
    -- In this case, we create a function that lets us more easily define mappings specific
    -- for LSP related items. It sets the mode, buffer and description for us each time.
    local nmap = function(keys, func, desc)
        if desc then
            desc = 'LSP: ' .. desc
        end

        vim.keymap.set('n', keys, func, { buffer = bufnr, desc = desc })
    end

    nmap('<leader>rn', vim.lsp.buf.rename, '[R]e[n]ame')
    nmap('<leader>ca', vim.lsp.buf.code_action, '[C]ode [A]ction')

    nmap('gd', require('telescope.builtin').lsp_definitions, '[G]oto [D]efinition')
    nmap('gr', require('telescope.builtin').lsp_references, '[G]oto [R]eferences')
    nmap('gI', require('telescope.builtin').lsp_implementations, '[G]oto [I]mplementation')
    nmap('<leader>D', require('telescope.builtin').lsp_type_definitions, 'Type [D]efinition')
    nmap('<leader>ds', require('telescope.builtin').lsp_document_symbols, '[D]ocument [S]ymbols')
    nmap('<leader>ws', require('telescope.builtin').lsp_dynamic_workspace_symbols, '[W]orkspace [S]ymbols')

    -- See `:help K` for why this keymap
    nmap('K', vim.lsp.buf.hover, 'Hover Documentation')
    nmap('<C-k>', vim.lsp.buf.signature_help, 'Signature Documentation')

    -- Lesser used LSP functionality
    nmap('gD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')
    nmap('<leader>wa', vim.lsp.buf.add_workspace_folder, '[W]orkspace [A]dd Folder')
    nmap('<leader>wr', vim.lsp.buf.remove_workspace_folder, '[W]orkspace [R]emove Folder')
    nmap('<leader>wl', function()
        print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
    end, '[W]orkspace [L]ist Folders')

    -- Create a command `:Format` local to the LSP buffer
    vim.api.nvim_buf_create_user_command(bufnr, 'Format', function(_)
        vim.lsp.buf.format()
    end, { desc = 'Format current buffer with LSP' })
end

-- document existing key chains
require('which-key').register {
    ['<leader>c'] = { name = '[C]ode', _ = 'which_key_ignore' },
    ['<leader>d'] = { name = '[D]ocument', _ = 'which_key_ignore' },
    ['<leader>g'] = { name = '[G]it', _ = 'which_key_ignore' },
    -- ['<leader>h'] = { name = 'More git', _ = 'which_key_ignore' },
    ['<leader>r'] = { name = '[R]ename', _ = 'which_key_ignore' },
    ['<leader>s'] = { name = '[S]earch', _ = 'which_key_ignore' },
    ['<leader>w'] = { name = '[W]orkspace', _ = 'which_key_ignore' },
    ['<leader>f'] = { name = '[F]ile Management', _ = 'which_key_ignore' },
    ['<leader>o'] = { name = '[O]pen', _ = 'which_key_ignore' },
    ['<leader>l'] = { name = '[L]ook', _ = 'which_key_ignore' }
}

-- mason-lspconfig requires that these setup functions are called in this order
-- before setting up the servers.
require('mason').setup()
require('mason-lspconfig').setup()

-- Enable the following language servers
--  Feel free to add/remove any LSPs that you want here. They will automatically be installed.
--
--  Add any additional override configuration in the following tables. They will be passed to
--  the `settings` field of the server config. You must look up that documentation yourself.
--
--  If you want to override the default filetypes that your language server will attach to you can
--  define the property 'filetypes' to the map in question.
local servers = {
    -- clangd = {},
    -- gopls = {},
    -- pyright = {},
    -- rust_analyzer = {},
    -- tsserver = {},
    -- html = { filetypes = { 'html', 'twig', 'hbs'} },

    lua_ls = {
        Lua = {
            workspace = { checkThirdParty = false },
            telemetry = { enable = false },
        },
    },
}

-- Setup neovim lua configuration
require('neodev').setup()

-- nvim-cmp supports additional completion capabilities, so broadcast that to servers
local capabilities = vim.lsp.protocol.make_client_capabilities()
capabilities = require('cmp_nvim_lsp').default_capabilities(capabilities)

-- Ensure the servers above are installed
local mason_lspconfig = require 'mason-lspconfig'

mason_lspconfig.setup {
    ensure_installed = vim.tbl_keys(servers),
}

mason_lspconfig.setup_handlers {
    function(server_name)
        require('lspconfig')[server_name].setup {
            capabilities = capabilities,
            on_attach = on_attach,
            settings = servers[server_name],
            filetypes = (servers[server_name] or {}).filetypes,
        }
    end,
}

-- [[ Configure nvim-cmp ]]
-- See `:help cmp`
local cmp = require 'cmp'
local luasnip = require 'luasnip'
require('luasnip.loaders.from_vscode').lazy_load()
luasnip.config.setup {}

cmp.setup {
    snippet = {
        expand = function(args)
            luasnip.lsp_expand(args.body)
        end,
    },
    mapping = cmp.mapping.preset.insert {
        ['<C-n>'] = cmp.mapping.select_next_item(),
        ['<C-p>'] = cmp.mapping.select_prev_item(),
        ['<C-d>'] = cmp.mapping.scroll_docs(-4),
        ['<C-f>'] = cmp.mapping.scroll_docs(4),
        -- ['<CR>'] = cmp.mapping.complete {},
        ['<Tab>'] = cmp.mapping.confirm {
            behavior = cmp.ConfirmBehavior.Replace,
            select = true,
        },
        ['<C-Tab>'] = cmp.mapping(function(fallback)
            if cmp.visible() then
                cmp.select_next_item()
            elseif luasnip.expand_or_locally_jumpable() then
                luasnip.expand_or_jump()
            else
                fallback()
            end
        end, { 'i', 's' }),
        ['<S-Tab>'] = cmp.mapping(function(fallback)
            if cmp.visible() then
                cmp.select_prev_item()
            elseif luasnip.locally_jumpable(-1) then
                luasnip.jump(-1)
            else
                fallback()
            end
        end, { 'i', 's' }),
    },
    sources = {
        { name = 'nvim_lsp' },
        { name = 'luasnip' },
    },

    'tpope/vim-fugitive',
    'tpope/vim-rhubarb',
    {
        'tpope/vim-commentary',
        config = function()
            vim.keymap.set('n', '<leader>/', 'gcc', { desc = '[/] Comment Out Current Line' })
            vim.keymap.set('v', '<leader>/', 'gc', { desc = '[/] Comment Out Current Selection' })
        end,
    },
}

-- The line beneath this is called `modeline`. See `:help modeline`
-- vim: ts=4 sts=4 sw=4 et
--
