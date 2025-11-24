-- Add isDemo column to relevant tables
ALTER TABLE profiles ADD COLUMN is_demo BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN is_demo BOOLEAN DEFAULT false;
ALTER TABLE checkins ADD COLUMN is_demo BOOLEAN DEFAULT false;
ALTER TABLE night_statuses ADD COLUMN is_demo BOOLEAN DEFAULT false;
ALTER TABLE yap_messages ADD COLUMN is_demo BOOLEAN DEFAULT false;

-- Create index for efficient filtering
CREATE INDEX idx_profiles_is_demo ON profiles(is_demo);
CREATE INDEX idx_posts_is_demo ON posts(is_demo);
CREATE INDEX idx_checkins_is_demo ON checkins(is_demo);
CREATE INDEX idx_night_statuses_is_demo ON night_statuses(is_demo);
CREATE INDEX idx_yap_messages_is_demo ON yap_messages(is_demo);