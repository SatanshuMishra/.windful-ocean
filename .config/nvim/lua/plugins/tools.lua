-- ============================================================================
--                        DEVELOPMENT TOOLS
-- ============================================================================

return {
    -- ========================================================================
    --                           DISCORD PRESENCE
    -- ========================================================================

    {
        "IogaMaster/neocord",
        event = "VeryLazy",
        config = function()
            local presence = require('core.utils').DiscordPresence

            local function repository_button(_, repo_url)
                if not repo_url or presence.get_matching_project() then
                    return nil
                end
                return { { label = "View Repository", url = repo_url } }
            end

            require("neocord").setup({
                logo_tooltip = "NEOVIM",
                main_image = "logo",
                blacklist = {},
                buttons = repository_button,
                show_time = true,
                editing_text = presence.get_editing_text,
                reading_text = presence.get_reading_text,
                file_explorer_text = presence.get_explorer_text,
                workspace_text = function(project_name)
                    return presence.get_workspace_text(project_name)
                end,
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