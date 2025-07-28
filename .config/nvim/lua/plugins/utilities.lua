-- ============================================================================
--                        UTILITY PLUGINS
-- ============================================================================

return {
    -- ========================================================================
    --                           MINI.CLUE KEYMAP HINTS
    -- ========================================================================

    {
        'echasnovski/mini.clue',
        version = '*',
        event = "VeryLazy",
        config = function()
            -- CONFIGURE TIMEOUT FOR KEYMAP HINTS
            vim.o.timeout = true
            vim.o.timeoutlen = 300
            
            local miniclue = require('mini.clue')
            miniclue.setup({
                -- SHOW HINTS FOR THESE TRIGGERS
                triggers = {
                    -- LEADER TRIGGERS
                    { mode = 'n', keys = '<Leader>' },
                    { mode = 'x', keys = '<Leader>' },
                    
                    -- BUILT-IN COMPLETION
                    { mode = 'i', keys = '<C-x>' },
                    
                    -- `g` KEY
                    { mode = 'n', keys = 'g' },
                    { mode = 'x', keys = 'g' },
                    
                    -- MARKS
                    { mode = 'n', keys = "'" },
                    { mode = 'n', keys = '`' },
                    { mode = 'x', keys = "'" },
                    { mode = 'x', keys = '`' },
                    
                    -- REGISTERS
                    { mode = 'n', keys = '"' },
                    { mode = 'x', keys = '"' },
                    { mode = 'i', keys = '<C-r>' },
                    { mode = 'c', keys = '<C-r>' },
                    
                    -- WINDOW COMMANDS
                    { mode = 'n', keys = '<C-w>' },
                    
                    -- `z` KEY
                    { mode = 'n', keys = 'z' },
                    { mode = 'x', keys = 'z' },
                },
                
                -- CLUE DESCRIPTIONS FOR LEADER KEY GROUPS
                clues = {
                    -- ENHANCE THIS BY ADDING DESCRIPTIONS FOR <Leader> MAPPING GROUPS
                    miniclue.gen_clues.builtin_completion(),
                    miniclue.gen_clues.g(),
                    miniclue.gen_clues.marks(),
                    miniclue.gen_clues.registers(),
                    miniclue.gen_clues.windows(),
                    miniclue.gen_clues.z(),
                    
                    -- CUSTOM LEADER KEY GROUPS
                    { mode = 'n', keys = '<Leader>c', desc = '+[C]ode' },
                    { mode = 'n', keys = '<Leader>f', desc = '+[F]ile Management' },
                    { mode = 'n', keys = '<Leader>g', desc = '+[G]it' },
                    { mode = 'n', keys = '<Leader>h', desc = '+Git [H]unk' },
                    { mode = 'n', keys = '<Leader>l', desc = '+[L]ook/List' },
                    { mode = 'n', keys = '<Leader>p', desc = '+[P]roject/Open' },
                    { mode = 'n', keys = '<Leader>r', desc = '+[R]ename' },
                    { mode = 'n', keys = '<Leader>s', desc = '+[S]earch' },
                    { mode = 'n', keys = '<Leader>w', desc = '+[W]orkspace' },
                    { mode = 'n', keys = '<Leader>x', desc = '+Debug/E[x]ecute' },
                    { mode = 'n', keys = '<Leader>doc', desc = '+[Doc]ument' },
                },
                
                -- CLUE WINDOW APPEARANCE
                window = {
                    delay = 200,
                    config = {
                        border = 'rounded',
                        width = 'auto',
                    },
                },
            })
        end
    },

    -- ========================================================================
    --                           TODO COMMENTS
    -- ========================================================================

    {
        "folke/todo-comments.nvim",
        dependencies = { "nvim-lua/plenary.nvim" },
        event = { "BufReadPost", "BufNewFile" },
        keys = {
            { "]t", desc = "NEXT TODO COMMENT" },
            { "[t", desc = "PREVIOUS TODO COMMENT" },
            { "<leader>lt", desc = "TODO TROUBLE" },
            { "<leader>lT", desc = "TODO TELESCOPE" },
        },
        config = function()
            require("todo-comments").setup({
                signs = true,
                sign_priority = 8,
                keywords = {
                    FIX = { icon = " ", color = "error", alt = { "FIXME", "BUG", "FIXIT", "ISSUE" } },
                    TODO = { icon = "✓", color = "info" },
                    DEBUG = { icon = " ", color = "warning" },
                    WARN = { icon = " ", color = "warning", alt = { "WARNING", "XXX" } },
                    PERF = { icon = " ", alt = { "OPTIM", "PERFORMANCE", "OPTIMIZE" } },
                    NOTE = { icon = " ", color = "hint", alt = { "INFO" } },
                    TEST = { icon = "⏲ ", color = "test", alt = { "TESTING", "PASSED", "FAILED" } },
                },
                colors = {
                    error = { "DiagnosticError", "ErrorMsg", "#DC2626" },
                    warning = { "DiagnosticWarn", "WarningMsg", "#FBBF24" },
                    info = { "DiagnosticInfo", "#2563EB" },
                    hint = { "DiagnosticHint", "#10B981" },
                    default = { "Identifier", "#7C3AED" },
                    test = { "Identifier", "#FF00FF" },
                },
            })

            -- TODO COMMENTS KEYMAPS
            local set_keymap = vim.keymap.set
            set_keymap("n", "]t", function() require("todo-comments").jump_next() end, { desc = "NEXT TODO" })
            set_keymap("n", "[t", function() require("todo-comments").jump_prev() end, { desc = "PREVIOUS TODO" })
            set_keymap("n", "<leader>lt", "<cmd>TodoTrouble<cr>", { desc = "TODO TROUBLE" })
            set_keymap("n", "<leader>lT", "<cmd>TodoTelescope<cr>", { desc = "TODO TELESCOPE" })
        end,
    },

    -- ========================================================================
    --                           TROUBLE DIAGNOSTICS
    -- ========================================================================

    {
        "folke/trouble.nvim",
        dependencies = { "nvim-tree/nvim-web-devicons" },
        cmd = "Trouble",
        keys = {
            { "<leader>lp", "<cmd>Trouble diagnostics toggle<cr>", desc = "TOGGLE DIAGNOSTICS" },
        },
        config = function()
            require("trouble").setup({
                modes = {
                    diagnostics = {
                        mode = "diagnostics",
                        preview = {
                            type = "split",
                            relative = "win",
                            position = "right",
                            size = 0.3,
                        },
                    },
                },
            })
        end,
    },

    -- ========================================================================
    --                           LSPSAGA ENHANCEMENTS
    -- ========================================================================

    {
        "nvimdev/lspsaga.nvim",
        event = "LspAttach",
        dependencies = {
            "nvim-treesitter/nvim-treesitter",
            "nvim-tree/nvim-web-devicons"
        },
        config = function()
            require("lspsaga").setup({
                ui = {
                    border = "rounded",
                    code_action = "💡",
                },
                lightbulb = {
                    enable = true,
                    sign = true,
                    virtual_text = false,
                },
                diagnostic = {
                    on_insert = false,
                    on_insert_follow = false,
                    show_code_action = true,
                    show_source = true,
                    jump_num_shortcut = true,
                    max_width = 0.7,
                    max_height = 0.6,
                    text_hl_follow = true,
                    border_follow = true,
                    keys = {
                        exec_action = "o",
                        quit = "q",
                        go_action = "g"
                    },
                },
                hover = {
                    max_width = 0.6,
                    open_link = 'gx',
                    open_browser = '!chrome',
                },
            })
        end,
    },

    -- ========================================================================
    --                           SESSION MANAGEMENT
    -- ========================================================================

    {
        'rmagatti/auto-session',
        lazy = false,
        dependencies = {
            'nvim-telescope/telescope.nvim', -- Only needed if Telescope sessions enabled
        },
        keys = {
            { '<leader>ps', '<cmd>SessionSearch<cr>', desc = '[P]roject [S]essions' },
            { '<leader>pr', '<cmd>SessionRestore<cr>', desc = '[P]roject [R]estore Session' },
            { '<leader>pS', '<cmd>SessionSave<cr>', desc = '[P]roject [S]ave Session' },
            { '<leader>pd', '<cmd>SessionDelete<cr>', desc = '[P]roject [D]elete Session' },
        },
        config = function()
            require('auto-session').setup({
                -- Enable logging for troubleshooting
                log_level = 'error',
                
                -- Auto save session on exit
                auto_save_enabled = true,
                
                -- Auto restore session on startup
                auto_restore_enabled = false, -- Set to false to avoid auto-restoring, use manual restore
                
                -- Auto create new session if none exists
                auto_create_enabled = true,
                
                -- Use current working directory as session name
                auto_session_use_git_branch = false,
                
                -- Session root directory
                auto_session_root_dir = vim.fn.stdpath('data') .. '/sessions/',
                
                -- Files to exclude from session
                auto_session_suppress_dirs = {
                    '~/',
                    '~/Downloads',
                    '~/Documents',
                    '~/Desktop',
                    '/tmp',
                },
                
                -- Session lens configuration for Telescope integration
                session_lens = {
                    buftypes_to_ignore = {}, -- list of buffer types what should not be deleted from current session
                    load_on_setup = true,
                    theme_conf = { border = true },
                    previewer = false,
                },
                
                -- Pre and post session hooks
                pre_save_cmds = {
                    "lua vim.notify('Saving session...', vim.log.levels.INFO)"
                },
                post_restore_cmds = {
                    "lua vim.notify('Session restored! 🎉', vim.log.levels.INFO)"
                },
                
                -- Integration with tmux session naming (if tmux is running)
                bypass_session_save_file_types = { 'oil', 'alpha', 'dashboard' },
            })
            
            -- Update mini.clue descriptions for session management
            local clue_ok, miniclue = pcall(require, 'mini.clue')
            if clue_ok then
                miniclue.config.clues = miniclue.config.clues or {}
                table.insert(miniclue.config.clues, { mode = 'n', keys = '<Leader>p', desc = '+[P]roject/Session' })
            end
        end,
    },

    -- ========================================================================
    --                           LSP ENHANCEMENTS
    -- ========================================================================

    {
        'smjonas/inc-rename.nvim',
        cmd = "IncRename",
        keys = {
            { '<leader>rn', function() 
                return ':IncRename ' .. vim.fn.expand('<cword>')
            end, desc = '[R]e[n]ame with live preview', expr = true },
        },
        config = function()
            require('inc_rename').setup({
                cmd_name = 'IncRename',
                hl_group = 'Substitute',
                preview_empty_name = false,
                show_message = true,
                input_buffer_type = nil,
                post_hook = function(result)
                    if result.changes then
                        vim.notify(
                            string.format("Renamed %d occurrences in %d files", 
                                result.changes.total or 0, 
                                result.changes.files or 0
                            ),
                            vim.log.levels.INFO
                        )
                    end
                end,
            })
        end,
    },

    {
        'kosayoda/nvim-lightbulb',
        event = "LspAttach",
        config = function()
            require('nvim-lightbulb').setup({
                priority = 10,
                hide_in_unfocused_buffer = true,
                link_highlights = true,
                validate_config = 'auto',
                action_kinds = nil,
                sign = {
                    enabled = true,
                    text = "💡",
                    hl = "LightBulbSign",
                },
                virtual_text = {
                    enabled = false,
                    text = "💡",
                    pos = "eol",
                    hl = "LightBulbVirtualText",
                    hl_mode = "combine",
                },
                float = {
                    enabled = false,
                    text = "💡",
                    hl = "LightBulbFloatWin",
                    win_opts = {},
                },
                status_text = {
                    enabled = false,
                    text = "💡",
                    text_unavailable = "",
                },
                autocmd = {
                    enabled = true,
                    updatetime = 200,
                    events = { "CursorHold", "CursorHoldI" },
                    pattern = { "*" },
                },
                ignore = {
                    clients = {},
                    ft = {},
                    actions_without_kind = false,
                },
            })
        end,
    },

    {
        'Wansmer/symbol-usage.nvim',
        event = "LspAttach",
        config = function()
            require('symbol-usage').setup({
                kinds = { 'Function', 'Method', 'Class', 'Struct' },
                kinds_filter = {},
                symbol_request_pos = 'end',
                references = { enabled = true, include_declaration = false },
                definition = { enabled = false },
                implementation = { enabled = false },
                disable = { lsp = {}, filetypes = {}, cond = {} },
                filetypes = {},
                symbol_request_pos = 'end',
                text_format = function(symbol)
                    local res = {}
                    
                    local round_start = { '', 'SymbolUsageRounding' }
                    local round_end = { '', 'SymbolUsageRounding' }
                    
                    if symbol.references then
                        local usage = symbol.references <= 1 and 'usage' or 'usages'
                        local num = symbol.references == 0 and 'no' or symbol.references
                        table.insert(res, round_start)
                        table.insert(res, { '󰌹 ', 'SymbolUsageRef' })
                        table.insert(res, { ('%s %s'):format(num, usage), 'SymbolUsageContent' })
                        table.insert(res, round_end)
                    end
                    
                    return res
                end,
                request_pending_text = 'loading...',
                vt_position = 'end_of_line',
                disable = {
                    cond = {
                        function() return vim.fn.mode() == 'i' end,
                    }
                },
            })
            
            -- Set up custom highlight groups
            vim.api.nvim_create_autocmd("ColorScheme", {
                callback = function()
                    vim.api.nvim_set_hl(0, 'SymbolUsageRounding', { fg = '#7c7c7c', italic = true })
                    vim.api.nvim_set_hl(0, 'SymbolUsageContent', { fg = '#9ca0a4', italic = true })
                    vim.api.nvim_set_hl(0, 'SymbolUsageRef', { fg = '#fab387', italic = true })
                end,
            })
            vim.api.nvim_exec_autocmds("ColorScheme", { pattern = "*" })
        end,
    },

    {
        'dnlhc/glance.nvim',
        cmd = { 'Glance' },
        keys = {
            { 'gd', '<cmd>Glance definitions<cr>', desc = 'LSP: Glance definitions' },
            { 'gr', '<cmd>Glance references<cr>', desc = 'LSP: Glance references' },
            { 'gi', '<cmd>Glance implementations<cr>', desc = 'LSP: Glance implementations' },
            { 'gy', '<cmd>Glance type_definitions<cr>', desc = 'LSP: Glance type definitions' },
        },
        config = function()
            require('glance').setup({
                height = 18,
                zindex = 45,
                preview_win_opts = {
                    cursorline = true,
                    number = true,
                    wrap = true,
                },
                border = {
                    enable = true,
                    top_char = '─',
                    bottom_char = '─',
                },
                list = {
                    position = 'right',
                    width = 0.33,
                },
                theme = {
                    enable = true,
                    mode = 'auto',
                },
                mappings = {
                    list = {
                        ['j'] = 'next_location',
                        ['k'] = 'previous_location',
                        ['<Down>'] = 'next_location',
                        ['<Up>'] = 'previous_location',
                        ['<Tab>'] = 'next_location',
                        ['<S-Tab>'] = 'previous_location',
                        ['<C-u>'] = 'preview_scroll_win 5',
                        ['<C-d>'] = 'preview_scroll_win -5',
                        ['v'] = 'jump_vsplit',
                        ['s'] = 'jump_split',
                        ['t'] = 'jump_tab',
                        ['<CR>'] = 'jump',
                        ['o'] = 'jump',
                        ['l'] = 'open_fold',
                        ['h'] = 'close_fold',
                        ['<leader>l'] = 'enter_win',
                        ['q'] = 'close',
                        ['Q'] = 'close',
                        ['<Esc>'] = 'close',
                    },
                    preview = {
                        ['Q'] = 'close',
                        ['<Tab>'] = 'next_location',
                        ['<S-Tab>'] = 'previous_location',
                        ['<leader>l'] = 'enter_win',
                    },
                },
                hooks = {},
                folds = {
                    fold_closed = '',
                    fold_open = '',
                    folded = true,
                },
                indent_lines = {
                    enable = true,
                    icon = '│',
                },
                winbar = {
                    enable = true,
                },
            })
        end,
    },
}