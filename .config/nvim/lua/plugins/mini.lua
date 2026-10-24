-- ============================================================================
--                           MINI.NVIM SUITE
-- ============================================================================
-- A unified suite of fast, reliable plugins with consistent APIs
-- Replaces multiple separate plugins for better performance and reliability

return {
    -- ========================================================================
    --                         MINI.SURROUND - SURROUND OPERATIONS
    -- ========================================================================
    -- Replaces: tpope/vim-surround
    
    {
        'nvim-mini/mini.surround',
        version = false,
        event = { "BufReadPost", "BufNewFile" },
        opts = {
            mappings = {
                add = 'gsa',
                delete = 'gsd',
                find = 'gsf',
                find_left = 'gsF',
                highlight = 'gsh',
                replace = 'gsr',
            },
            custom_surroundings = nil,
            highlight_duration = 500,
            n_lines = 20,
            respect_selection_type = false,
            search_method = 'cover',
            silent = false,
        },
    },

    -- ========================================================================
    --                         MINI.PAIRS - AUTO PAIRS
    -- ========================================================================
    -- Replaces: windwp/nvim-autopairs
    
    {
        'nvim-mini/mini.pairs',
        version = false,
        event = "InsertEnter",
        opts = {
            modes = { insert = true, command = false, terminal = false },
            skip_next = [=[[%w%%%'%[%"%.%`%$]]=],
            skip_ts = { 'string' },
            skip_unbalanced = true,
            markdown = true,
        },
        config = function(_, opts)
            require('mini.pairs').setup(opts)
            
            -- Integration with nvim-cmp (if installed)
            local has_cmp, cmp = pcall(require, 'cmp')
            if has_cmp then
                local on_confirm_done = function()
                    local line = vim.fn.getline('.')
                    local col = vim.fn.col('.')
                    local char_before = line:sub(col-1, col-1)
                    local char_after = line:sub(col, col)
                    
                    -- Handle function calls and similar patterns
                    if char_before == '(' and char_after == ')' then
                        vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes('<Left>', true, false, true), 'n', false)
                    end
                end
                
                cmp.event:on('confirm_done', on_confirm_done)
            end
        end,
    },

    -- ========================================================================
    --                         MINI.INDENTSCOPE - INDENT VISUALIZATION
    -- ========================================================================
    -- Replaces: lukas-reineke/indent-blankline.nvim
    -- Shows animated scope of current indentation level
    
    {
        'nvim-mini/mini.indentscope',
        version = false,
        event = { "BufReadPost", "BufNewFile" },
        opts = function()
            return {
                symbol = "┊",
                options = { try_as_border = true },
                draw = {
                    delay = 100,
                    animation = require('mini.indentscope').gen_animation.quadratic({
                        easing = 'out',
                        duration = 100,
                        unit = 'total'
                    }),
                },
                mappings = {
                    object_scope = 'ii',
                    object_scope_with_border = 'ai',
                    goto_top = '[i',
                    goto_bottom = ']i',
                },
            }
        end,
        init = function()
            vim.api.nvim_create_autocmd("FileType", {
                pattern = {
                    "help",
                    "alpha",
                    "dashboard",
                    "neo-tree",
                    "Trouble",
                    "trouble",
                    "lazy",
                    "mason",
                    "notify",
                    "toggleterm",
                    "lazyterm",
                    "oil",
                },
                callback = function()
                    vim.b.miniindentscope_disable = true
                end,
            })
        end,
    },

    -- ========================================================================
    --                         MINI.AI - IMPROVED TEXT OBJECTS
    -- ========================================================================
    -- Bonus: Enhanced text objects (no direct replacement, but very useful)
    
    {
        'nvim-mini/mini.ai',
        version = false,
        event = { "BufReadPost", "BufNewFile" },
        opts = function()
            local ai = require('mini.ai')
            return {
                n_lines = 500,
                custom_textobjects = {
                    o = ai.gen_spec.treesitter({
                        a = { "@block.outer", "@conditional.outer", "@loop.outer" },
                        i = { "@block.inner", "@conditional.inner", "@loop.inner" },
                    }, {}),
                    f = ai.gen_spec.treesitter({ a = "@function.outer", i = "@function.inner" }, {}),
                    c = ai.gen_spec.treesitter({ a = "@class.outer", i = "@class.inner" }, {}),
                    t = { "<([%p%w]-)%f[^<%w][^<>]->.-</%1>", "^<.->().*()</[^/]->$" },
                    d = { "%f[%d]%d+" }, -- digits
                    e = { -- Word with case
                        { "%u[%l%d]+%f[^%l%d]", "%f[%S][%l%d]+%f[^%l%d]", "%f[%P][%l%d]+%f[^%l%d]", "^[%l%d]+%f[^%l%d]" },
                        "^().*()$",
                    },
                    g = function() -- Whole buffer
                        local from = { line = 1, col = 1 }
                        local to = {
                            line = vim.fn.line('$'),
                            col = math.max(vim.fn.getline('$'):len(), 1)
                        }
                        return { from = from, to = to }
                    end,
                },
            }
        end,
    },
}
