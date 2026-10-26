# Android

Load this reference when building for Android. Each rule names the Sources entries it comes from.

## Targets

- Make every touch target at least 48x48 dp. (Sources 1, 2)
- Separate touch targets by 8 dp or more. (Sources 1, 2)
- Prefer larger targets than the minimum. (Source 2)
- Targets meant only for precise pointer input may be smaller. (Source 2)

## Contrast and type

- Give text smaller than 18 sp, or bold text smaller than 14 sp, a contrast ratio of at least 4.5:1. (Sources 1, 3, 4)
- Give all other text at least 3:1. (Sources 1, 3, 4)
- Give non-text elements at least 3:1 against their surface. (Source 3)
- Hold icons and images to the same ratios. (Sources 3, 4)

## Destructive actions

- After an action that can be undone, show a snackbar that confirms it and offers Undo. (Source 5)
- Ask for confirmation in a dialog before an action such as deleting a file. (Source 6)
- Give a destructive gesture a visible control too, such as a trash icon button. (Source 3)

## Unavailable actions

No platform rule; the standard's default applies.

## Progress

- Use a determinate indicator to show exactly how much progress has been made. (Source 7)
- Use an indeterminate indicator when progress is unknown. (Source 7)
- Make a custom indicator report its current value and range through progressBarRangeInfo. (Source 8)

## Over media

- Place controls over images on a scrim that keeps contrast. (Source 9)
- Change the scrim with the control's state. (Source 9)

## Placement

- Treat a window as compact below 600 dp wide, medium from 600 to 840 dp and expanded from 840 to 1200 dp. (Source 10)
- Use a bottom navigation bar when width or height is compact, and a navigation rail otherwise. (Sources 11, 12)
- Do not reuse one bottom bar across window sizes. (Source 12)
- Offer one floating action button for the screen's single primary action, anchored bottom right and pinned with Scaffold. (Source 13)
- From the standard's Role default, not from Sources: a floating action button is never a destructive action.

## Sources

1. https://developer.android.com/guide/topics/ui/accessibility/apps
2. https://support.google.com/accessibility/android/answer/7101858
3. https://developer.android.com/design/ui/mobile/guides/foundations/accessibility
4. https://support.google.com/accessibility/android/answer/7158390
5. https://developer.android.com/develop/ui/compose/components/snackbar
6. https://developer.android.com/develop/ui/compose/components/dialog
7. https://developer.android.com/develop/ui/compose/components/progress
8. https://developer.android.com/develop/ui/compose/accessibility/semantics
9. https://developer.android.com/design/ui/tv/guides/components/buttons
10. https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
11. https://developer.android.com/develop/ui/compose/layouts/adaptive/build-adaptive-navigation
12. https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns
13. https://developer.android.com/develop/ui/compose/components/fab
