-- ============================================================================
--                         GIT INTEGRATION
-- ============================================================================

return {
    -- ========================================================================
    --                           GITSIGNS
    -- ========================================================================

    {
        'lewis6991/gitsigns.nvim',
        event = { "BufReadPre", "BufNewFile" },
        config = function()
            require('gitsigns').setup({
                signs = {
                    add = { text = '+' },
                    change = { text = '~' },
                    delete = { text = '_' },
                    topdelete = { text = '^' },
                    changedelete = { text = '~' },
                },
                on_attach = function(bufnr)
                    local gs = package.loaded.gitsigns
                    local set_keymap = vim.keymap.set

                    -- GIT HUNK NAVIGATION
                    set_keymap('n', ']c', function()
                        if vim.wo.diff then return ']c' end
                        vim.schedule(function() gs.next_hunk() end)
                        return '<Ignore>'
                    end, { expr = true, buffer = bufnr, desc = 'NEXT GIT HUNK' })

                    set_keymap('n', '[c', function()
                        if vim.wo.diff then return '[c' end
                        vim.schedule(function() gs.prev_hunk() end)
                        return '<Ignore>'
                    end, { expr = true, buffer = bufnr, desc = 'PREVIOUS GIT HUNK' })

                    -- GIT ACTIONS
                    set_keymap('n', '<leader>hp', gs.preview_hunk, { buffer = bufnr, desc = 'PREVIEW GIT HUNK' })
                    set_keymap('n', '<leader>hs', gs.stage_hunk, { buffer = bufnr, desc = 'STAGE GIT HUNK' })
                    set_keymap('n', '<leader>hr', gs.reset_hunk, { buffer = bufnr, desc = 'RESET GIT HUNK' })
                    set_keymap('n', '<leader>hS', gs.stage_buffer, { buffer = bufnr, desc = 'STAGE BUFFER' })
                    set_keymap('n', '<leader>hu', gs.undo_stage_hunk, { buffer = bufnr, desc = 'UNDO STAGE HUNK' })
                    set_keymap('n', '<leader>hR', gs.reset_buffer, { buffer = bufnr, desc = 'RESET BUFFER' })
                    set_keymap('n', '<leader>hb', function() gs.blame_line({ full = true }) end, 
                        { buffer = bufnr, desc = 'BLAME LINE' })
                    set_keymap('n', '<leader>hd', gs.diffthis, { buffer = bufnr, desc = 'DIFF THIS' })
                    set_keymap('n', '<leader>hD', function() gs.diffthis('~') end, 
                        { buffer = bufnr, desc = 'DIFF THIS ~' })

                    -- TEXT OBJECT
                    set_keymap({ 'o', 'x' }, 'ih', ':<C-U>Gitsigns select_hunk<CR>', 
                        { buffer = bufnr, desc = 'SELECT GIT HUNK' })
                end,
            })
        end,
    },

    -- ========================================================================
    --                           LAZYGIT
    -- ========================================================================

    {
        "kdheepak/lazygit.nvim",
        dependencies = { "nvim-lua/plenary.nvim" },
        cmd = "LazyGit",
        keys = {
            { "<leader>gg", "<cmd>LazyGit<cr>", desc = "OPEN LAZYGIT" },
        },
    },
}