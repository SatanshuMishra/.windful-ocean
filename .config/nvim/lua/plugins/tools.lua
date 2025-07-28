-- ============================================================================
--                        DEVELOPMENT TOOLS
-- ============================================================================

return {
    -- ========================================================================
    --                           DISCORD PRESENCE
    -- ========================================================================

    {
        "andweeb/presence.nvim",
        event = "VeryLazy",
        config = function()
            local utils = require('core.utils')

            require("presence").setup({
                auto_update = true,
                neovim_image_text = "NEOVIM",
                main_image = "neovim",
                blacklist = {},
                buttons = true,
                show_time = true,
                
                -- Override the details field directly
                format_details = function(filename, filepath)
                    local project_name = vim.fn.fnamemodify(vim.fn.getcwd(), ":t")
                    return string.format("🚧 %s", project_name)
                end,
                
                -- Custom presence states
                format_state = function(filename, filepath)
                    local filetype = vim.bo.filetype
                    local filesize = vim.fn.getfsize(filepath)
                    
                    if filesize < 0 then
                        return "Browsing files"
                    elseif filetype == "TelescopePrompt" then
                        return "Searching"
                    elseif filepath:find("lazy.nvim") then
                        return "Managing plugins"
                    elseif vim.bo.modified then
                        return string.format("Editing `%s`", filename)
                    else
                        return string.format("Reading `%s`", filename)
                    end
                end,
                
                -- Simplified line number text
                line_number_text = "Line %s of %s",
            })
        end,
    },

    -- ========================================================================
    --                           CODE SCREENSHOTS
    -- ========================================================================

    {
        "michaelrommel/nvim-silicon",
        cmd = "Silicon",
        keys = {
            { "<leader>cs", ":'<,'>Silicon<CR>", mode = "v", desc = "SCREENSHOT CODE" },
        },
        config = function()
            require("silicon").setup({
                font = "JetBrainsMono Nerd Font=34",
                theme = "Coldark-Dark",
                background = "#71f3f5",
                window_title = function()
                    return vim.fn.fnamemodify(vim.api.nvim_buf_get_name(vim.api.nvim_get_current_buf()), ":t")
                end,
                pad_horiz = 50,
                pad_vert = 50,
                tab_width = 4,
                no_window_controls = false,
                no_line_number = false,
                no_round_corner = false,
                to_clipboard = true,
                output = function()
                    return "~/Documents/DevLab/SnipSnippets/" .. os.date("!%Y-%m-%dT%H-%M-%SZ") .. "_code.png"
                end
            })
        end,
    },

    -- ========================================================================
    --                           TMUX NAVIGATION
    -- ========================================================================

    {
        "christoomey/vim-tmux-navigator",
        keys = {
            { "<C-h>", "<cmd>TmuxNavigateLeft<cr>", desc = "TMUX LEFT" },
            { "<C-j>", "<cmd>TmuxNavigateDown<cr>", desc = "TMUX DOWN" },
            { "<C-k>", "<cmd>TmuxNavigateUp<cr>", desc = "TMUX UP" },
            { "<C-l>", "<cmd>TmuxNavigateRight<cr>", desc = "TMUX RIGHT" },
        },
    },

    -- ========================================================================
    --                           HARDTIME TRAINER
    -- ========================================================================

    {
        "m4xshen/hardtime.nvim",
        dependencies = { "MunifTanjim/nui.nvim" },
        event = "VeryLazy",
        config = function()
            require("hardtime").setup({
                disabled_keys = {
                    ["<Up>"] = {},
                    ["<Down>"] = {},
                },
                disabled_filetypes = { "oil", "lazy" },
            })
        end,
    },

    -- ========================================================================
    --                           TYPST SUPPORT
    -- ========================================================================

    {
        'kaarmu/typst.vim',
        ft = 'typst',
    },
}