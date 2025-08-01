-- ============================================================================
--                    CODE COMPLETION & SNIPPETS
-- ============================================================================

return {
    -- ========================================================================
    --                         NVIM-CMP COMPLETION ENGINE
    -- ========================================================================

    {
        'hrsh7th/nvim-cmp',
        event = "InsertEnter",
        dependencies = {
            'L3MON4D3/LuaSnip',
            'saadparwaiz1/cmp_luasnip',
            'hrsh7th/cmp-nvim-lsp',
            'hrsh7th/cmp-buffer',
            'hrsh7th/cmp-path',
            'rafamadriz/friendly-snippets',
        },
        config = function()
            local cmp = require('cmp')
            local luasnip = require('luasnip')

            require('luasnip.loaders.from_vscode').lazy_load()
            luasnip.config.setup({})

            cmp.setup({
                snippet = {
                    expand = function(args)
                        luasnip.lsp_expand(args.body)
                    end,
                },
                mapping = cmp.mapping.preset.insert({
                    ['<C-n>'] = cmp.mapping.select_next_item(),
                    ['<C-p>'] = cmp.mapping.select_prev_item(),
                    ['<C-d>'] = cmp.mapping.scroll_docs(-4),
                    ['<C-f>'] = cmp.mapping.scroll_docs(4),
                    ['<Tab>'] = cmp.mapping.confirm({
                        behavior = cmp.ConfirmBehavior.Replace,
                        select = true,
                    }),
                    ['<C-Tab>'] = cmp.mapping(function(fallback)
                        if cmp.visible() then
                            cmp.select_next_item()
                        elseif luasnip.expand_or_locally_jumpable() then
                            luasnip.expand_or_jump()
                        else
                            fallback()
                        end
                    end, { 'i', 's' }),
                    ['<S-Tab>'] = cmp.mapping(function(fallback)
                        if cmp.visible() then
                            cmp.select_prev_item()
                        elseif luasnip.locally_jumpable(-1) then
                            luasnip.jump(-1)
                        else
                            fallback()
                        end
                    end, { 'i', 's' }),
                }),
                sources = {
                    { name = 'nvim_lsp' },
                    { name = 'luasnip' },
                    { name = 'buffer' },
                    { name = 'path' },
                },
            })
        end,
    },

    -- ========================================================================
    --                         AUTO PAIRS
    -- ========================================================================
    -- NOTE: Replaced by mini.pairs for better performance and treesitter integration

    -- ========================================================================
    --                           AI ASSISTANCE
    -- ========================================================================

    {
        'github/copilot.vim',
        event = "InsertEnter",
        config = function()
            -- COPILOT CONFIGURATION
            vim.g.copilot_no_tab_map = true
            vim.keymap.set('i', '<C-G>', 'copilot#Accept("<CR>")', {
                expr = true,
                replace_keycodes = false,
                desc = "ACCEPT COPILOT SUGGESTION"
            })
        end,
    },
}