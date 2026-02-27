

## Plan: Re-rank venues by actual popularity

Update `popularity_rank` for all LA (56) and NYC (85) launch venues using reality-based ranking — busiest, most well-known, hardest-to-get-into venues rank highest regardless of neighborhood.

### LA Top 20 (reality-based)
1. Bootsy Bellows (WeHo) — #1 nightlife institution
2. Raspoutine (WeHo) — exclusive high-end club
3. Fleur Room LA (WeHo) — celebrity hotspot
4. Poppy (WeHo) — top nightclub
5. Sunset at EDITION (WeHo) — buzzy hotel club
6. Warwick (Hollywood) — A-list club
7. Bar Lis (Hollywood) — packed rooftop
8. Keys (WeHo) — members-club vibe
9. Exchange LA (DTLA) — mega club
10. Academy LA (Hollywood) — major venue
11. The Bungalow (Santa Monica) — legendary beach bar
12. Skybar at Mondrian (WeHo) — iconic rooftop
13. Highlight Room (Hollywood) — celeb rooftop
14. Lure (Hollywood) — staple club
15. Apt 200 (Hollywood) — popular club
16. No Vacancy (Hollywood) — speakeasy bar
17. Employees Only (WeHo) — cocktail institution
18. Perch (DTLA) — best rooftop bar
19. La Descarga (DTLA) — acclaimed cocktail bar
20. The Mayan (DTLA) — massive venue

This is heavily WeHo/Hollywood because that's where LA nightlife actually concentrates. Remaining 36 venues ranked 21-56.

### NYC Top 20 (reality-based)
1. Marquee (Chelsea) — legendary club
2. The Box (LES) — iconic cabaret
3. TAO Downtown (Meatpacking) — mega lounge
4. Le Bain at The Standard (West Village) — rooftop institution
5. LAVO (Chelsea) — top nightclub
6. Brooklyn Mirage / Avant Gardner (Williamsburg) — mega venue
7. Elsewhere (Williamsburg) — premier club
8. House of Yes (Bushwick) — cultural institution
9. Bagatelle (Meatpacking) — brunch/club scene
10. Paul's Casablanca (SoHo) — hottest lounge
11. The Stranger (Midtown) — buzzy new club
12. Nebula (Midtown) — top club
13. Paradise Club at EDITION (Midtown) — immersive
14. Ketchy Shuby (East Village) — hot club
15. The Blond (SoHo) — exclusive lounge
16. Pianos (LES) — nightlife staple
17. Catch Rooftop (Meatpacking) — scene rooftop
18. Gansevoort Rooftop (Meatpacking) — classic rooftop
19. PHD Terrace (Chelsea) — popular rooftop
20. Good Room (Bushwick) — top dance club

Remaining 65 venues ranked 21-85.

### Execution
Single SQL UPDATE statement per venue using a `CASE` expression to set all ranks in one query. Will also clean up duplicate/old venues from non-launch neighborhoods.

### Files
- No file changes — data-only UPDATE via SQL

