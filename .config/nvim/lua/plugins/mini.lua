-- ============================================================================
--                           MINI.NVIM SUITE
-- ============================================================================
-- A unified suite of fast, reliable plugins with consistent APIs
-- Replaces multiple separate plugins for better performance and reliability

return {
    -- ========================================================================
    --                         MINI.COMMENT - CODE COMMENTING
    -- ========================================================================
    -- Replaces: numToStr/Comment.nvim
    
    {
        'echasnovski/mini.comment',
        version = false,
        event = { "BufReadPost", "BufNewFile" },
        opts = {
            options = {
                custom_commentstring = nil,
                ignore_blank_line = false,
                start_of_line = false,
                pad_comment_parts = true,
            },
            mappings = {
                -- Toggle comment on current line (normal and visual modes)
                comment = 'gc',
                -- Toggle comment on visual selection
                comment_visual = 'gc',
                -- Toggle comment on current line
                comment_line = 'gcc',
                -- Define text object for comment block
                textobject = 'gc',
            },
            hooks = {
                pre = function() end,
                post = function() end,
            },
        },
    },

    -- ========================================================================
    --                         MINI.SURROUND - SURROUND OPERATIONS
    -- ========================================================================
    -- Replaces: tpope/vim-surround
    -- NOTE: Changes from ys/ds/cs to sa/sd/sr for more intuitive feel
    
    {
        'echasnovski/mini.surround',
        version = false,
        event = { "BufReadPost", "BufNewFile" },
        opts = {
            mappings = {
                add = 'sa',      -- Add surrounding (was ys in vim-surround)
                delete = 'sd',   -- Delete surrounding (was ds)
                find = 'sf',     -- Find surrounding (to the right)
                find_left = 'sF', -- Find surrounding (to the left)
                highlight = 'sh', -- Highlight surrounding
                replace = 'sr',  -- Replace surrounding (was cs)
                update_n_lines = 'sn', -- Update `n_lines`
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
        'echasnovski/mini.pairs',
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
        'echasnovski/mini.indentscope',
        version = false,
        event = { "BufReadPost", "BufNewFile" },
        opts = {
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
        },
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
        'echasnovski/mini.ai',
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

    -- ========================================================================
    --                         MINI.HIPATTERNS - HIGHLIGHT PATTERNS
    -- ========================================================================
    -- Bonus: Better highlighting for TODO, FIXME, etc.
    
    {
        'echasnovski/mini.hipatterns',
        version = false,
        event = { "BufReadPost", "BufNewFile" },
        opts = function()
            local hipatterns = require('mini.hipatterns')
            return {
                highlighters = {
                    -- Highlight standalone 'FIXME', 'HACK', 'TODO', 'NOTE'
                    fixme = { pattern = '%f[%w]()FIXME()%f[%W]', group = 'MiniHipatternsFixme' },
                    hack  = { pattern = '%f[%w]()HACK()%f[%W]',  group = 'MiniHipatternsHack'  },
                    todo  = { pattern = '%f[%w]()TODO()%f[%W]',  group = 'MiniHipatternsTodo'  },
                    note  = { pattern = '%f[%w]()NOTE()%f[%W]',  group = 'MiniHipatternsNote'  },

                    -- Highlight hex color strings (`#rrggbb`) using that color
                    hex_color = hipatterns.gen_highlighter.hex_color(),
                },
            }
        end,
        config = function(_, opts)
            require('mini.hipatterns').setup(opts)
            
            -- Set custom highlight groups
            vim.api.nvim_create_autocmd("ColorScheme", {
                callback = function()
                    vim.api.nvim_set_hl(0, 'MiniHipatternsFixme', { bg = '#ff6b6b', fg = '#ffffff', bold = true })
                    vim.api.nvim_set_hl(0, 'MiniHipatternsHack',  { bg = '#ffa500', fg = '#000000', bold = true })
                    vim.api.nvim_set_hl(0, 'MiniHipatternsTodo',  { bg = '#4ecdc4', fg = '#000000', bold = true })
                    vim.api.nvim_set_hl(0, 'MiniHipatternsNote',  { bg = '#95e1d3', fg = '#000000', bold = true })
                end,
            })
            
            -- Apply highlights immediately
            vim.api.nvim_exec_autocmds("ColorScheme", { pattern = "*" })
        end,
    },
}