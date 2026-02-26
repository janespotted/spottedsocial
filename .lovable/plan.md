

# Add Admin Role for jane@joinspottedapp.com

Insert the admin role for user `1522911d-2533-4347-b6af-1587cbb2dc8b` into the `user_roles` table.

**Single SQL insert:**
```sql
INSERT INTO user_roles (user_id, role)
VALUES ('1522911d-2533-4347-b6af-1587cbb2dc8b', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

No code changes needed.

