-- ============================================================================
--                        VISUAL ENHANCEMENTS & UI
-- ============================================================================

return {
    -- ========================================================================
    --                           STATUS LINE
    -- ========================================================================

    {
        "nvim-lualine/lualine.nvim",
        event = "VeryLazy",
        dependencies = { "nvim-tree/nvim-web-devicons" },
        config = function()
            require("lualine").setup({
                options = {
                    icons_enabled = true,
                    theme = "auto",
                    component_separators = "|",
                    section_separators = "",
                    disabled_filetypes = { 'oil' },
                },
                sections = {
                    lualine_a = { 'mode' },
                    lualine_b = { 'branch', 'diff', 'diagnostics' },
                    lualine_c = { 'filename' },
                    lualine_x = { 'encoding', 'fileformat', 'filetype' },
                    lualine_y = { 'progress' },
                    lualine_z = { 'location' }
                },
            })
        end,
    },

    -- ========================================================================
    --                         COLOR HIGHLIGHTING
    -- ========================================================================

    {
        "brenoprata10/nvim-highlight-colors",
        event = { "BufReadPost", "BufNewFile" },
        config = function()
            require("nvim-highlight-colors").setup({
                render = 'background',
                enable_named_colors = true,
                enable_tailwind = true,
            })
        end,
    },

    -- ========================================================================
    --                         INDENT VISUALIZATION
    -- ========================================================================
    -- NOTE: Replaced by mini.indentscope for animated scope highlighting

    -- ========================================================================
    --                         COLOR THEMES
    -- ========================================================================

    {
        "folke/tokyonight.nvim",
        lazy = false,
        priority = 1000,
    },

    {
        "catppuccin/nvim",
        name = "catppuccin",
        lazy = false,
        priority = 1000,
    },

    {
        "rose-pine/neovim",
        name = "rose-pine",
        lazy = false,
        priority = 1000,
    },

    {
        'nyoom-engineering/oxocarbon.nvim',
        name = "oxocarbon",
        lazy = false,
        priority = 1000,
    },

    -- ========================================================================
    --                         WEB DEV ICONS
    -- ========================================================================

    {
        "nvim-tree/nvim-web-devicons",
        config = function()
            require("nvim-web-devicons").setup({
                strict = true,
                override_by_extension = {
                    ["astro"] = {
                        icon = "",
                        color = "#f1502f",
                        name = "Astro",
                    },
                    ["sql"] = {
                        icon = "󰆼",
                        color = "#336791",
                        name = "SQL",
                    },
                },
            })
        end,
    },
}