-- ============================================================================
--                      TELESCOPE FUZZY FINDER
-- ============================================================================

local function picker(name, opts)
    return function()
        require('telescope.builtin')[name](opts)
    end
end

local function fuzzy_find_in_buffer()
    require('telescope.builtin').current_buffer_fuzzy_find(require('telescope.themes').get_dropdown({
        winblend = 10,
        previewer = false,
    }))
end

return {
    {
        'nvim-telescope/telescope.nvim',
        version = '*',
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
        keys = {
            { '<leader>?', picker('oldfiles'), desc = 'RECENTLY OPENED FILES' },
            { '<leader><space>', picker('buffers'), desc = 'FIND BUFFERS' },
            { '<leader>/', fuzzy_find_in_buffer, desc = 'FUZZY SEARCH IN BUFFER' },
            { '<leader>gf', picker('git_files'), desc = 'SEARCH GIT FILES' },
            { '<leader>sf', picker('find_files'), desc = 'SEARCH FILES' },
            { '<leader>sw', picker('grep_string'), desc = 'SEARCH WORD' },
            { '<leader>sg', picker('live_grep'), desc = 'SEARCH BY GREP' },
            { '<leader>sh', picker('help_tags'), desc = 'SEARCH HELP' },
            { '<leader>sd', picker('diagnostics'), desc = 'SEARCH DIAGNOSTICS' },
            { '<leader>sr', picker('resume'), desc = 'SEARCH RESUME' },
        },
        config = function()
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

            pcall(require('telescope').load_extension, 'fzf')
        end,
    },
}
