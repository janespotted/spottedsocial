

## Plan: Show "I'm Down" plan notifications in Activity Center

The notification is already being created when someone marks themselves as "down" on your plan (`plan_down` type in notifications table). The ActivityTab already fetches these notifications. However, three things are missing:

### Changes in `src/components/messages/ActivityTab.tsx`

1. **Add plan_down to section filtering** (around line 900-909): Create a `planDowns` filter array:
   ```
   const planDowns = activities.filter(a => a.type === 'plan_down');
   ```

2. **Add content render block** (after the rally block ~line 1044): Render plan_down items with the person's name and the message (e.g. "Jake is down for your plan at Bar Lunatico! 🎉"):
   ```
   {activity.type === 'plan_down' && (
     <div className="text-white text-sm">
       <div className="flex items-center gap-2">
         <span className="font-semibold">{activity.display_name}</span>
         <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
       </div>
       <span className="text-[#d4ff00] block text-xs mt-0.5">{activity.subtitle}</span>
     </div>
   )}
   ```

3. **Add chat action button** (after venue_yap button ~line 1150): A chat icon button to message the person who's down:
   ```
   {activity.type === 'plan_down' && (
     <Button onClick={() => handleOpenChat(activity)} ...>
       <MessageCircle /> Chat
     </Button>
   )}
   ```

4. **Add section to layout** (after Accepted section ~line 1200): New "Down for Plans" section:
   ```
   {planDowns.length > 0 && (
     <div className="space-y-3">
       <h3>🎉 Down for Your Plans</h3>
       {planDowns.map(renderActivityCard)}
     </div>
   )}
   ```

5. **Update `hasContent` check** (line 1157): Add `planDowns.length > 0` to the condition.

