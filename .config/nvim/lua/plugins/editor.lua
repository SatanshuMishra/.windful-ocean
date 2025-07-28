-- ============================================================================
--                        EDITING ENHANCEMENTS
-- ============================================================================

return {
    -- ========================================================================
    --                           FLASH MOTION
    -- ========================================================================

    {
        'folke/flash.nvim',
        event = "VeryLazy",
        opts = {},
        keys = {
            { "s", mode = { "n", "x", "o" }, function() require("flash").jump() end, desc = "Flash" },
            { "S", mode = { "n", "x", "o" }, function() require("flash").treesitter() end, desc = "Flash Treesitter" },
            { "r", mode = "o", function() require("flash").remote() end, desc = "Remote Flash" },
            { "R", mode = { "o", "x" }, function() require("flash").treesitter_search() end, desc = "Treesitter Search" },
            { "<c-s>", mode = { "c" }, function() require("flash").toggle() end, desc = "Toggle Flash Search" },
        },
        config = function()
            require("flash").setup({
                -- Use default options with minimal customization
                search = {
                    multi_window = true,
                },
                modes = {
                    -- Enhance default f/t motions
                    char = {
                        enabled = true,
                        keys = { "f", "F", "t", "T" },
                    },
                },
                -- Custom highlight colors
                highlight = {
                    groups = {
                        match = "FlashMatch",
                        current = "FlashCurrent",
                        backdrop = "FlashBackdrop",
                        label = "FlashLabel",
                    },
                },
            })

            -- Set custom highlight colors for Flash
            vim.api.nvim_create_autocmd("ColorScheme", {
                callback = function()
                    -- Lime green for matched text
                    vim.api.nvim_set_hl(0, "FlashMatch", { bg = "#93be7c", fg = "#000000", bold = true })
                    -- Blue background with white text for labels
                    vim.api.nvim_set_hl(0, "FlashLabel", { bg = "#00afff", fg = "#ffffff", bold = true })
                    -- Dim the background
                    vim.api.nvim_set_hl(0, "FlashBackdrop", { fg = "#666666" })
                end,
            })

            -- Apply highlights immediately
            vim.api.nvim_exec_autocmds("ColorScheme", { pattern = "*" })
        end,
    },

    -- ========================================================================
    --                           SURROUND & COMMENT OPERATIONS
    -- ========================================================================
    -- NOTE: Replaced by mini.nvim suite for better performance and consistency
    -- mini.surround: sa/sd/sr (add/delete/replace surrounding)
    -- mini.comment: gcc/gc (toggle comment line/selection)
}