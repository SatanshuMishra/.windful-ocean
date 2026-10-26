# Apple platforms: iOS, iPadOS and macOS

Apply these rules on top of reference/standard.md when building for iOS, iPadOS or macOS.

## Targets

- On iOS and iPadOS, size a control at 44x44 pt by default and never below 28x28 pt.
- On macOS, size a control at 28x28 pt by default and never below 20x20 pt.
- On touch, give every button a hit region of at least 44x44 pt.
- Leave about 12 pt of padding around a bezelled element and about 24 pt around an unbezelled one.

## Contrast and type

- Give text up to 17 pt a contrast ratio of at least 4.5:1, and text at 18 pt or bold text at least 3:1.
- Offer a higher-contrast colour scheme when Increase Contrast is on.
- Check contrast in both the light and the dark appearance.
- Set body text at 17 pt on iOS and iPadOS, never below 11 pt.
- Set body text at 13 pt on macOS, never below 10 pt.
- Avoid the Ultralight, Thin and Light weights.

## Destructive actions

- Give a destructive button the destructive role, shown in system red, and never the primary role.
- Show no alert for a common action that can be undone, even a destructive one; offer undo instead.
- For an uncommon action that cannot be undone, show an alert with a Cancel button, and never make the destructive button the default.
- On iOS and iPadOS, offer the choices about an intentional action in an action sheet, with destructive buttons at its top and Cancel at its bottom.

## Unavailable actions

- Show an unavailable item dimmed and make it unresponsive.
- Keep a menu available even when every item in it is unavailable.

## Progress

- Prefer a determinate progress indicator.
- Switch an indeterminate indicator to a determinate one as soon as the amount of work is known.
- Keep the indicator moving.
- Never switch an indicator between the circular and the bar style.
- Add a description only when it gives context, never a vague label such as loading, and never label a spinner.
- On macOS, prefer a spinner for a background operation.

## Over media

- Over bright content, add a dark dimming layer of about 35% opacity behind text and controls.
- Use the regular material where background content could hurt legibility, and vibrant colours on materials.
- Keep overlays on video deferential and translucent.

## Placement

- Put the default button on the trailing side of a row of buttons, or at the top of a stack, and Cancel on the leading side or at the bottom.
- Keep controls legible above scrolling content with a scroll edge effect.

## Sources

- https://developer.apple.com/design/human-interface-guidelines/accessibility
- https://developer.apple.com/design/human-interface-guidelines/buttons
- https://developer.apple.com/design/human-interface-guidelines/typography
- https://developer.apple.com/design/human-interface-guidelines/alerts
- https://developer.apple.com/design/human-interface-guidelines/action-sheets
- https://developer.apple.com/design/human-interface-guidelines/undo-and-redo
- https://developer.apple.com/design/human-interface-guidelines/menus
- https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://developer.apple.com/design/human-interface-guidelines/playing-video
- https://developer.apple.com/design/human-interface-guidelines/layout
