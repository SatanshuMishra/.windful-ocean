-- ============================================================================
--                       SYNTAX HIGHLIGHTING & TREESITTER
-- ============================================================================

return {
    -- ========================================================================
    --                         NVIM-TREESITTER
    -- ========================================================================

    {
        'nvim-treesitter/nvim-treesitter',
        build = ':TSUpdate',
        event = { "BufReadPost", "BufNewFile" },
        dependencies = {
            'nvim-treesitter/nvim-treesitter-textobjects',
        },
        config = function()
            require('nvim-treesitter.configs').setup({
                ensure_installed = {
                    'c', 'cpp', 'go', 'lua', 'python', 'rust', 'tsx',
                    'javascript', 'typescript', 'vimdoc', 'vim', 'bash',
                    'html', 'css', 'json', 'yaml', 'toml', 'php', 'sql'
                },
                auto_install = true,
                sync_install = false,
                ignore_install = {},
                modules = {},
                
                highlight = {
                    enable = true,
                    additional_vim_regex_highlighting = false,
                },
                
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
                        lookahead = true,
                        keymaps = {
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
                        set_jumps = true,
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
                        swap_next = { ['<leader>a'] = '@parameter.inner' },
                        swap_previous = { ['<leader>A'] = '@parameter.inner' },
                    },
                },
            })
        end,
    },

    -- ========================================================================
    --                         ASTRO LANGUAGE SUPPORT
    -- ========================================================================

    {
        'virchau13/tree-sitter-astro',
        ft = 'astro',
    },
}