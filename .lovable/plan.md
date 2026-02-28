

## Migration: Add foreign key on `venue_buzz_messages.user_id`

Single migration adding a foreign key constraint from `venue_buzz_messages.user_id` to `profiles.id` with `ON DELETE CASCADE`.

```sql
ALTER TABLE public.venue_buzz_messages 
ADD CONSTRAINT venue_buzz_messages_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
```

No code changes needed.

