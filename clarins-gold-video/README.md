# Club Clarins: Silver to Gold personalized video

A 26-second vertical (1080x1920) HyperFrames video for Club Clarins Silver members. It shows each member how far they are from Gold.

## Variables (one row per member)

| Variable | Type | Notes |
| --- | --- | --- |
| `firstName` | string | Greeting and CTA. Names over 9 characters get a smaller font. |
| `currentPoints` | number | Clamped to the Silver range (2,500 to 7,999). |
| `asOfDate` | string | Shown in the disclaimer. |
| `shopUrl` | string | Shown under the CTA button. |

The video works out the rest:
- Points to Gold = 8,000 minus current points
- Estimated spend = ceil(gap / 11), using the Silver earn rate of 11 points per $1

## Scenes

1. Greeting: "Bonjour, {firstName}"
2. Current tier: Silver badge
3. Progress: points count up on a Silver-to-Gold bar, then the points still needed
4. Spend: dollar estimate and the 11 points per $1 earn rate
5. Gold perks: 12 points per $1, priority customer care, plus all Silver perks
6. CTA: "Shop now" and a disclaimer

## Render

```bash
npx hyperframes check
npx hyperframes render --batch members.sample.json --output "renders/clarins-gold-{firstName}.mp4" --strict-variables
```

For production, use a unique id per row in the output template (for example, add a `memberId` variable). First names collide.

## Assumptions to verify with Clarins

- Tier thresholds (Member 0-2,499 / Silver 2,500-7,999 / Gold 8,000+) and earn rates (10/11/12 points per $1) come from third-party summaries of the Club Clarins US program. The clarinsusa.com pages could not be reached from the build environment.
- Brand red `#B40024` comes from a third-party brand-color listing.
- The wordmark is set in Cormorant Garamond as a stand-in. Replace it with the official Clarins logo SVG, and replace Cormorant Garamond and Jost with the brand's licensed fonts.
- There is no audio. Music and voiceover need a HeyGen-authenticated media provider, or files you supply.
