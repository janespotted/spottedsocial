-- Drop existing foreign key constraints on notifications table
ALTER TABLE notifications 
DROP CONSTRAINT IF EXISTS notifications_receiver_id_fkey;

ALTER TABLE notifications 
DROP CONSTRAINT IF EXISTS notifications_sender_id_fkey;

-- Add new foreign key constraints referencing profiles table
ALTER TABLE notifications
ADD CONSTRAINT notifications_receiver_id_fkey 
FOREIGN KEY (receiver_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE notifications
ADD CONSTRAINT notifications_sender_id_fkey 
FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;