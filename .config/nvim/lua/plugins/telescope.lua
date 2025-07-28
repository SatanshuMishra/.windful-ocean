-- ============================================================================
--                      TELESCOPE FUZZY FINDER
-- ============================================================================

return {
    -- TELESCOPE PLUGIN SPECIFICATION
    {
        'nvim-telescope/telescope.nvim',
        branch = '0.1.x',
        cmd = "Telescope",
        dependencies = {
            'nvim-lua/plenary.nvim',
            {
                'nvim-telescope/telescope-fzf-native.nvim',
                build = 'make',
                cond = function()
                    return vim.fn.executable 'make' == 1
                end,
            },
        },
        config = function()
            -- TELESCOPE CONFIGURATION
            require('telescope').setup({
                defaults = {
                    file_ignore_patterns = { "node_modules", ".git/" },
                    mappings = {
                        i = {
                            ['<C-u>'] = false,
                            ['<C-d>'] = false,
                        },
                    },
                },
                pickers = {
                    find_files = {
                        hidden = true,
                    },
                },
            })

            -- ENABLE TELESCOPE EXTENSIONS
            pcall(require('telescope').load_extension, 'fzf')

            -- ================================================================
            --                      TELESCOPE KEYMAPS
            -- ================================================================

            local builtin = require('telescope.builtin')
            local set_keymap = vim.keymap.set

            -- FILE AND BUFFER NAVIGATION
            set_keymap('n', '<leader>?', builtin.oldfiles, { desc = 'RECENTLY OPENED FILES' })
            set_keymap('n', '<leader><space>', builtin.buffers, { desc = 'FIND BUFFERS' })
            set_keymap('n', '<leader>/', function()
                builtin.current_buffer_fuzzy_find(require('telescope.themes').get_dropdown({
                    winblend = 10,
                    previewer = false,
                }))
            end, { desc = 'FUZZY SEARCH IN BUFFER' })

            -- FILE SEARCH
            set_keymap('n', '<leader>gf', builtin.git_files, { desc = 'SEARCH GIT FILES' })
            set_keymap('n', '<leader>sf', builtin.find_files, { desc = 'SEARCH FILES' })

            -- CONTENT SEARCH
            set_keymap('n', '<leader>sw', builtin.grep_string, { desc = 'SEARCH WORD' })
            set_keymap('n', '<leader>sg', builtin.live_grep, { desc = 'SEARCH BY GREP' })

            -- HELP AND DIAGNOSTICS
            set_keymap('n', '<leader>sh', builtin.help_tags, { desc = 'SEARCH HELP' })
            set_keymap('n', '<leader>sd', builtin.diagnostics, { desc = 'SEARCH DIAGNOSTICS' })

            -- TELESCOPE UTILITIES
            set_keymap('n', '<leader>sr', builtin.resume, { desc = 'SEARCH RESUME' })
        end,
    },
}