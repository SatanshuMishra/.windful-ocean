# Welcome to my Dotfiles & Configs Repository

Hi There 👋! Welcome to the place where I store my personal `dotfiles` & `configs`. Feel free to take the `dotfiles` & `configs` you find here and modify them to suit your needs!

> Note: The tutorial below uses `stow` to install & maintain the `dotfiles` and `configs`. However, you may also install them manually by simply drag-and-dropping them at their respective directories.

## Pre-Requisites

> You must be using an Unix system in order to following this tutorial.

Before you begin, make sure you have a package manager such as `Homebrew` and `git` installed on your system.

## Getting Started

To get started, lets install `stow` on your system. You can do so by running the following command:

```bash
brew install stow # Homebrew
```

You can check to see `stow` has installed properly by running:

```bash
stow --help
```

Finally, at a location of your choosing, clone this repository.

> Many tutorials will tell you to clone the repository directly in your `$HOME` directory. However, I will be using stow's `-target` tag to define the directory manually.

## Installation

You can use `stow` to create symbolic links (symlinks) in the `$HOME` directory to the `dotfiles` and `configurations` in this repository. 

Before you begin, **remember to back-up** your existing `dotfiles` & `configurations`. Make sure to navigate into the repository you cloned above before continuing.

1. Check to make sure `stow` is doing what it's supposed to using the `-nv` or `--no --verbose` which will simulate the `stow` command without actually running the command. The `.` run's it in the current directory.

```bash
stow -nv .
```

A sample output demonstrating the expected format without errors would be:

```
LINK: .config => .windful-ocean/.config
LINK: .wezterm.lua => .windful-ocean/.wezterm.lua
LINK: .zshrc => .windful-ocean/.zshrc
WARNING: in simulation mode so not modifying filesystem.
```

If you get any errors, you will have to work through them before proceeding to the next step.

2. If everything looks good, then you can run the the actual `stow` command:

```bash
stow . -t ~
```
