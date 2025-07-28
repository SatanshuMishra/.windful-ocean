-- ============================================================================
--                       DEBUG ADAPTER PROTOCOL (DAP)
-- ============================================================================

return {
    -- ========================================================================
    --                         DAP PLUGIN SPECIFICATION
    -- ========================================================================

    {
        'mfussenegger/nvim-dap',
        dependencies = {
            'rcarriga/nvim-dap-ui',
            'theHamsta/nvim-dap-virtual-text',
            'nvim-neotest/nvim-nio',
        },
        keys = {
            { "<leader>xb", desc = "TOGGLE BREAKPOINT" },
            { "<leader>xc", desc = "CONTINUE/START DEBUGGING" },
            { "<leader>xt", desc = "TERMINATE DEBUGGING" },
            { "<leader>xo", desc = "STEP OVER" },
            { "<leader>xi", desc = "STEP INTO" },
        },
        config = function()
            local dap = require('dap')
            local dapui = require('dapui')

            -- ================================================================
            --                         DAP UI SETUP
            -- ================================================================

            dapui.setup({
                icons = { expanded = "▾", collapsed = "▸", current_frame = "▸" },
                mappings = {
                    expand = { "<CR>", "<2-LeftMouse>" },
                    open = "o",
                    remove = "d",
                    edit = "e",
                    repl = "r",
                    toggle = "t",
                },
                layouts = {
                    {
                        elements = {
                            { id = "scopes", size = 0.25 },
                            "breakpoints",
                            "stacks",
                            "watches",
                        },
                        size = 40,
                        position = "left",
                    },
                    {
                        elements = {
                            "repl",
                            "console",
                        },
                        size = 0.25,
                        position = "bottom",
                    },
                },
                controls = {
                    enabled = true,
                    element = "repl",
                    icons = {
                        pause = "⏸",
                        play = "▶",
                        step_into = "⏎",
                        step_over = "⏭",
                        step_out = "⏮",
                        step_back = "b",
                        run_last = "▶▶",
                        terminate = "⏹",
                        disconnect = "⏏",
                    },
                },
                floating = {
                    max_height = nil,
                    max_width = nil,
                    border = "rounded",
                    mappings = { close = { "q", "<Esc>" } },
                },
            })

            -- ================================================================
            --                     VIRTUAL TEXT FOR DEBUGGING
            -- ================================================================

            require("nvim-dap-virtual-text").setup({
                enabled = true,
                enabled_commands = true,
                highlight_changed_variables = true,
                highlight_new_as_changed = false,
                show_stop_reason = true,
                commented = false,
                only_first_definition = true,
                all_references = false,
                filter_references_pattern = '<module',
                virt_text_pos = 'eol',
                all_frames = false,
                virt_lines = false,
                virt_text_win_col = nil
            })

            -- ================================================================
            --                      DEBUG ADAPTER SETUP
            -- ================================================================

            -- PHP DEBUGGING WITH XDEBUG
            dap.adapters.php = {
                type = 'executable',
                command = 'node',
                args = { 
                    vim.fn.stdpath('data') .. '/mason/packages/php-debug-adapter/extension/out/phpDebug.js' 
                }
            }

            dap.configurations.php = {
                {
                    type = 'php',
                    request = 'launch',
                    name = 'LISTEN FOR XDEBUG',
                    port = 9003,
                    pathMappings = {
                        ["/var/www/html"] = "${workspaceFolder}"
                    },
                    hostname = "localhost",
                    xdebugSettings = {
                        max_children = 128,
                        max_data = 1024,
                        max_depth = 2,
                    },
                },
                {
                    type = 'php',
                    request = 'launch',
                    name = 'LAUNCH CURRENT FILE',
                    program = '${file}',
                    cwd = '${workspaceFolder}',
                    runtimeExecutable = 'php',
                }
            }

            -- ================================================================
            --                   AUTOMATICALLY OPEN/CLOSE DAP UI
            -- ================================================================

            dap.listeners.after.event_initialized["dapui_config"] = function()
                dapui.open()
            end
            dap.listeners.before.event_terminated["dapui_config"] = function()
                dapui.close()
            end
            dap.listeners.before.event_exited["dapui_config"] = function()
                dapui.close()
            end

            -- ================================================================
            --                         DAP KEYMAPS
            -- ================================================================

            local set_keymap = vim.keymap.set

            set_keymap('n', '<leader>xb', dap.toggle_breakpoint, { desc = 'TOGGLE BREAKPOINT' })
            set_keymap('n', '<leader>xB', function()
                dap.set_breakpoint(vim.fn.input('BREAKPOINT CONDITION: '))
            end, { desc = 'CONDITIONAL BREAKPOINT' })
            set_keymap('n', '<leader>xc', dap.continue, { desc = 'CONTINUE/START DEBUGGING' })
            set_keymap('n', '<leader>xt', dap.terminate, { desc = 'TERMINATE DEBUGGING' })
            set_keymap('n', '<leader>xo', dap.step_over, { desc = 'STEP OVER' })
            set_keymap('n', '<leader>xi', dap.step_into, { desc = 'STEP INTO' })
            set_keymap('n', '<leader>xO', dap.step_out, { desc = 'STEP OUT' })
            set_keymap('n', '<leader>xr', dap.repl.open, { desc = 'OPEN REPL' })
            set_keymap('n', '<leader>xl', dap.run_last, { desc = 'RUN LAST' })
            set_keymap('n', '<leader>xu', dapui.toggle, { desc = 'TOGGLE DAP UI' })
        end,
    },
}