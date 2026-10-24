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
        lazy = true,
    },

    {
        "catppuccin/nvim",
        name = "catppuccin",
        lazy = false,
        priority = 1000,
        opts = {
            flavour = "mocha", -- LATTE, FRAPPE, MACCHIATO, MOCHA
            background = {
                light = "latte",
                dark = "mocha",
            },
            transparent_background = false,
            show_end_of_buffer = false,
            term_colors = false,
            dim_inactive = {
                enabled = false,
                shade = "dark",
                percentage = 0.15,
            },
            no_italic = false,
            no_bold = false,
            no_underline = false,
            styles = {
                comments = { "italic" },
                conditionals = { "italic" },
                loops = {},
                functions = {},
                keywords = {},
                strings = {},
                variables = {},
                numbers = {},
                booleans = {},
                properties = {},
                types = {},
                operators = {},
            },
            color_overrides = {},
            custom_highlights = {},
            integrations = {
                cmp = true,
                gitsigns = true,
                nvimtree = false,
                treesitter = true,
                notify = false,
                mini = {
                    enabled = true,
                },
                telescope = true,
                harpoon = true,
                mason = true,
                which_key = true,
                indent_blankline = {
                    enabled = true,
                    colored_indent_levels = false,
                },
                native_lsp = {
                    enabled = true,
                    virtual_text = {
                        errors = { "italic" },
                        hints = { "italic" },
                        warnings = { "italic" },
                        information = { "italic" },
                    },
                    underlines = {
                        errors = { "underline" },
                        hints = { "underline" },
                        warnings = { "underline" },
                        information = { "underline" },
                    },
                    inlay_hints = {
                        background = true,
                    },
                },
            },
        },
    },

    {
        "rose-pine/neovim",
        name = "rose-pine",
        lazy = true,
    },

    {
        'nyoom-engineering/oxocarbon.nvim',
        name = "oxocarbon",
        lazy = true,
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
                        icon = "\u{e6b3}",
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