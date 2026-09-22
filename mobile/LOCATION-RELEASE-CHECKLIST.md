# Location release checks

Use two real iPhones on the same new build, friends with the correct audience.
Keep Demo Mode off for the NYC/LA checks. Record phone models, iOS/build versions,
permission state, sample ages, actual venue arrival times and battery change.

- [ ] A checks in with While Using, then enables Automatic updates and Always.
      The other phone sees A's pin and venue. A's own pin agrees.
- [ ] Lock A and walk to a clearly separated bar. Confirm old check-in closes
      after departure, the pin moves, and the new venue appears after dwell.
      Repeat to a third venue and return to the first. No duplicate open rows.
- [ ] Walk a short distance (under 200m) between bars after being stationary
      for 10+ minutes. Verify motion wake and bounded follow-up sampling.
- [ ] Stand near two adjacent venues / floors. No repeated switching. Correct
      the venue manually; jitter must not immediately undo that choice.
- [ ] Pass a bar in a car, and dwell in a restaurant or stadium. No auto check-in.
- [ ] Remain stationary for two hours, screen locked. Pin remains as Last known
      if no fresh fix arrives; no fake timestamp, live pulse or live cluster.
- [ ] Compare self and friend pins after movement; zoom out and confirm people
      who left the same bar are no longer grouped there.
- [ ] Lose internet, move, then reconnect. Preserve actual sample time, discard
      samples older than two minutes, and recover automatically.
- [ ] Deny/revoke GPS, disable device Location Services, or supply poor indoor
      GPS. Old location ages honestly; reopening/settings recovery works.
- [ ] Stop sharing while offline and during an upload. No native restart or
      late repin. Reconnect and retry the failed status update; explicit new check-in
      permits tracking again. Repeat for TBD, No, sign-out and account switch.
- [ ] Private party: no background tracking or exact spot for non-close friends;
      no new party coordinates in checkins/profile. Close-friend pin works.
- [ ] At 5am in NYC and LA, server rejects updates and maps drop expired pins,
      including when device time zone differs. Check native collection stops.
- [ ] Force-quit, power off and reboot: no new movement until Spotted reopens.
      Last saved spot must be labeled by its real age.
- [ ] Deny notifications. Automatic updates still work without a prompt loop.
- [ ] Measure battery use over a real 4–6 hour night, including walking and long
      stationary periods. Confirm no arrival watch stays active past two minutes.
- [ ] Replace the October 7 trial SDK license before expiry and test a Release
      build. Debug/simulator success does not establish Release licensing.
