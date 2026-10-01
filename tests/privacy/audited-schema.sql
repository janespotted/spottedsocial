CREATE SCHEMA internal; CREATE OR REPLACE FUNCTION internal.enforce_leaderboard_eligibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if not coalesce(new.is_demo,false) and not (
    coalesce(new.leaderboard_category in ('bar','club'),false)
    and coalesce(new.type in ('bar','cocktail_bar','club','nightclub'),false)
  ) then
    new.popularity_rank := null;
    new.is_leaderboard_promoted := false;
    new.leaderboard_promo_order := null;
  end if;
  return new;
end;
$function$;

CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA cron; CREATE SCHEMA net; CREATE SCHEMA vault;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('role') $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub',auth.uid(),'role',auth.role()) $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO PUBLIC;
CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
SET check_function_bodies=false;
CREATE TYPE public."app_role" AS ENUM ('admin','moderator','user');
CREATE TYPE public."friendship_status_enum" AS ENUM ('pending','accepted','blocked');
CREATE TYPE public."night_status_enum" AS ENUM ('out','heading_out','home','planning','off');
CREATE TABLE public."party_locations"("user_id" uuid NOT NULL,"lat" double precision NOT NULL,"lng" double precision NOT NULL,"expires_at" timestamp with time zone NOT NULL,"updated_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."venue_editorial_recommendations"("venue_id" uuid NOT NULL,"source_url" text NOT NULL,"publisher" text NOT NULL,"source_title" text NOT NULL,"published_at" date NOT NULL,"verified_at" timestamp with time zone NOT NULL DEFAULT now(),"active" boolean NOT NULL DEFAULT true);
CREATE TABLE public."leaderboard_neighborhoods"("city" text NOT NULL,"name" text NOT NULL,"center_lat" double precision NOT NULL,"center_lng" double precision NOT NULL,"included_neighborhoods" text[] NOT NULL);
CREATE TABLE public."post_tags"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"post_id" uuid NOT NULL,"tagged_user_id" uuid NOT NULL,"created_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."posts"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"text" text NOT NULL,"image_url" text,"venue_name" text,"created_at" timestamp with time zone DEFAULT now(),"expires_at" timestamp with time zone NOT NULL,"is_demo" boolean DEFAULT false,"likes_count" integer DEFAULT 0,"comments_count" integer DEFAULT 0,"visibility" text DEFAULT 'all_friends'::text,"venue_id" uuid,"video_url" text,"media_type" text DEFAULT 'image'::text,"media_width" integer,"media_height" integer,"media_hash" text,"mux_upload_id" text,"mux_asset_id" text,"mux_playback_id" text,"mux_status" text);
CREATE TABLE public."venue_leaderboard_scores"("venue_id" uuid NOT NULL,"city" text NOT NULL,"internet_score" numeric(5,2) NOT NULL DEFAULT 50,"checkin_score" numeric(5,2) NOT NULL DEFAULT 50,"final_score" numeric(5,2) NOT NULL DEFAULT 50,"internet_confidence" numeric(5,4) NOT NULL DEFAULT 0,"unique_checkins_24h" integer NOT NULL DEFAULT 0,"unique_checkins_7d" integer NOT NULL DEFAULT 0,"source_count" integer NOT NULL DEFAULT 0,"source_breakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,"trend_label" text,"computed_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."venue_signal_events"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"venue_id" uuid NOT NULL,"source" text NOT NULL,"signal_kind" text NOT NULL DEFAULT 'buzz'::text,"score" numeric(5,2) NOT NULL,"weight" numeric(6,3) NOT NULL DEFAULT 1.0,"mention_count" integer NOT NULL DEFAULT 1,"source_url" text,"source_title" text,"observed_at" timestamp with time zone NOT NULL DEFAULT now(),"expires_at" timestamp with time zone,"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,"created_at" timestamp with time zone NOT NULL DEFAULT now(),"external_id" text);
CREATE TABLE public."live_location_state"("user_id" uuid NOT NULL,"status_revision" timestamp with time zone NOT NULL,"candidate_id" uuid,"candidate_since" timestamp with time zone,"candidate_last_at" timestamp with time zone,"candidate_samples" integer NOT NULL DEFAULT 0,"departure_since" timestamp with time zone,"last_recorded_at" timestamp with time zone,"expires_at" timestamp with time zone NOT NULL);
CREATE TABLE public."blocked_users"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"blocker_id" uuid NOT NULL,"blocked_id" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."dm_messages"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"thread_id" uuid NOT NULL,"sender_id" uuid NOT NULL,"text" text NOT NULL,"created_at" timestamp with time zone DEFAULT now(),"image_url" text);
CREATE TABLE public."dm_read_receipts"("thread_id" uuid NOT NULL,"user_id" uuid NOT NULL,"last_read_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."daily_nudges"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"nudge_date" date NOT NULL DEFAULT CURRENT_DATE,"first_nudge_sent_at" timestamp with time zone,"first_nudge_response" text,"second_nudge_sent_at" timestamp with time zone,"second_nudge_response" text,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."dm_message_reactions"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"message_id" uuid NOT NULL,"user_id" uuid NOT NULL,"reaction" text NOT NULL DEFAULT '❤️ '::text,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."dm_thread_members"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"thread_id" uuid NOT NULL,"user_id" uuid NOT NULL);
CREATE TABLE public."dm_threads"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"created_at" timestamp with time zone DEFAULT now(),"created_by" uuid,"name" text,"is_group" boolean DEFAULT false,"group_avatar_url" text);
CREATE TABLE public."event_logs"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"created_at" timestamp with time zone NOT NULL DEFAULT now(),"user_id" uuid,"event_type" text NOT NULL,"event_data" jsonb DEFAULT '{}'::jsonb,"metadata" jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public."event_rsvps"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"event_id" uuid NOT NULL,"user_id" uuid NOT NULL,"rsvp_type" text NOT NULL DEFAULT 'interested'::text,"created_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."events"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"venue_id" uuid,"venue_name" text NOT NULL,"title" text NOT NULL,"description" text,"event_date" date NOT NULL,"start_time" time without time zone NOT NULL,"end_time" time without time zone,"cover_image_url" text,"ticket_url" text,"city" text,"neighborhood" text,"created_at" timestamp with time zone NOT NULL DEFAULT now(),"expires_at" timestamp with time zone NOT NULL,"is_demo" boolean DEFAULT false,"created_by" uuid);
CREATE TABLE public."friendships"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"friend_id" uuid NOT NULL,"status" friendship_status_enum NOT NULL DEFAULT 'pending'::friendship_status_enum,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."invite_codes"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"code" text NOT NULL,"uses_count" integer DEFAULT 0,"max_uses" integer,"expires_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."invite_uses"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"invite_code_id" uuid NOT NULL,"inviter_id" uuid NOT NULL,"invited_user_id" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."location_detection_logs"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid,"event_type" text NOT NULL,"detected_venue_id" uuid,"confirmed_venue_id" uuid,"user_lat" double precision,"user_lng" double precision,"gps_accuracy" double precision,"distance_to_venue" double precision,"was_correct" boolean,"error_type" text,"error_message" text,"metadata" jsonb,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."notifications"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"receiver_id" uuid NOT NULL,"sender_id" uuid NOT NULL,"type" text NOT NULL,"message" text NOT NULL,"is_read" boolean DEFAULT false,"created_at" timestamp with time zone DEFAULT now(),"is_demo" boolean DEFAULT false);
CREATE TABLE public."plan_comments"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"plan_id" uuid NOT NULL,"user_id" uuid NOT NULL,"text" text NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."plan_downs"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"plan_id" uuid NOT NULL,"user_id" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."night_statuses"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"status" night_status_enum NOT NULL DEFAULT 'home'::night_status_enum,"lat" double precision,"lng" double precision,"venue_name" text,"updated_at" timestamp with time zone DEFAULT now(),"expires_at" timestamp with time zone,"is_demo" boolean DEFAULT false,"is_promoted" boolean DEFAULT false,"venue_id" uuid,"planning_neighborhood" text,"planning_visibility" text DEFAULT 'all_friends'::text,"is_private_party" boolean DEFAULT false,"party_neighborhood" text,"party_address" text,"planning_venue_id" uuid,"planning_venue_name" text,"automatic_venue_updates" boolean NOT NULL DEFAULT false);
CREATE TABLE public."close_friends"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"close_friend_id" uuid NOT NULL,"created_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."checkins"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"venue_name" text NOT NULL,"lat" double precision NOT NULL,"lng" double precision NOT NULL,"created_at" timestamp with time zone DEFAULT now(),"is_demo" boolean DEFAULT false,"is_promoted" boolean DEFAULT false,"venue_id" uuid,"started_at" timestamp with time zone DEFAULT now(),"ended_at" timestamp with time zone,"last_updated_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."plan_participants"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"plan_id" uuid NOT NULL,"user_id" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."plan_votes"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"plan_id" uuid NOT NULL,"user_id" uuid NOT NULL,"vote_type" text NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."post_comment_likes"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"comment_id" uuid NOT NULL,"user_id" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."post_comments"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"post_id" uuid NOT NULL,"user_id" uuid NOT NULL,"text" text NOT NULL,"created_at" timestamp with time zone DEFAULT now(),"likes_count" integer DEFAULT 0);
CREATE TABLE public."post_likes"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"post_id" uuid NOT NULL,"user_id" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."plans"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"venue_id" uuid,"venue_name" text NOT NULL,"plan_date" date NOT NULL,"plan_time" time without time zone NOT NULL,"description" text,"visibility" text NOT NULL DEFAULT 'friends'::text,"score" integer DEFAULT 0,"comments_count" integer DEFAULT 0,"is_demo" boolean DEFAULT false,"created_at" timestamp with time zone DEFAULT now(),"expires_at" timestamp with time zone NOT NULL,"plan_type" text);
CREATE TABLE public."promotion_interest"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"venue_id" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."push_logs"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid,"type" text,"payload" jsonb,"created_at" timestamp with time zone DEFAULT now(),"success" boolean,"error" text);
CREATE TABLE public."push_throttle"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"notification_type" text NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."rate_limit_actions"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"action_type" text NOT NULL,"created_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."reports"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"reporter_id" uuid NOT NULL,"reported_user_id" uuid,"reported_post_id" uuid,"reported_yap_id" uuid,"reason" text NOT NULL,"details" text,"status" text DEFAULT 'pending'::text,"created_at" timestamp with time zone DEFAULT now(),"reported_venue_id" uuid);
CREATE TABLE public."review_votes"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"review_id" uuid NOT NULL,"user_id" uuid NOT NULL,"vote_type" text NOT NULL,"created_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."stories"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"media_url" text NOT NULL,"media_type" text NOT NULL,"created_at" timestamp with time zone NOT NULL DEFAULT now(),"expires_at" timestamp with time zone NOT NULL,"is_demo" boolean DEFAULT false,"venue_name" text,"venue_id" uuid,"is_public_buzz" boolean DEFAULT false,"is_anonymous" boolean DEFAULT false,"visibility" text NOT NULL DEFAULT 'all_friends'::text);
CREATE TABLE public."story_views"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"story_id" uuid NOT NULL,"user_id" uuid NOT NULL,"viewed_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."user_roles"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"role" app_role NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."venue_auto_corrections"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"venue_id" uuid NOT NULL,"old_lat" double precision NOT NULL,"old_lng" double precision NOT NULL,"new_lat" double precision NOT NULL,"new_lng" double precision NOT NULL,"report_count" integer NOT NULL,"unique_user_count" integer NOT NULL,"reverted_at" timestamp with time zone,"reverted_by" uuid,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."venue_buzz_messages"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"venue_id" uuid NOT NULL,"venue_name" text NOT NULL,"text" text,"emoji_vibe" text,"is_anonymous" boolean DEFAULT true,"expires_at" timestamp with time zone NOT NULL,"created_at" timestamp with time zone DEFAULT now(),"is_demo" boolean DEFAULT false,"star_rating" smallint);
CREATE TABLE public."venue_claim_requests"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"venue_id" uuid,"venue_name" text,"business_email" text NOT NULL,"business_phone" text,"verification_notes" text,"status" text DEFAULT 'pending'::text,"reviewed_by" uuid,"reviewed_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."venue_location_reports"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"venue_id" uuid,"user_id" uuid,"reported_lat" double precision NOT NULL,"reported_lng" double precision NOT NULL,"user_lat" double precision NOT NULL,"user_lng" double precision NOT NULL,"report_type" text NOT NULL,"suggested_venue_name" text,"suggested_venue_type" text,"notes" text,"status" text DEFAULT 'pending'::text,"reviewed_at" timestamp with time zone,"reviewed_by" uuid,"created_at" timestamp with time zone DEFAULT now(),"auto_correction_id" uuid,"auto_corrected_at" timestamp with time zone);
CREATE TABLE public."venue_notif_throttle"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"notification_type" text NOT NULL,"venue_id" uuid NOT NULL,"friend_id" uuid NOT NULL,"notified_date" date NOT NULL DEFAULT CURRENT_DATE);
CREATE TABLE public."venue_owners"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"venue_id" uuid NOT NULL,"role" text DEFAULT 'owner'::text,"verified_at" timestamp with time zone DEFAULT now(),"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."venue_promotions"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"venue_id" uuid NOT NULL,"promotion_type" text NOT NULL,"status" text DEFAULT 'pending'::text,"starts_at" timestamp with time zone NOT NULL,"ends_at" timestamp with time zone NOT NULL,"amount_paid" integer,"stripe_payment_id" text,"stripe_subscription_id" text,"created_by" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."venue_reviews"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"venue_id" uuid NOT NULL,"user_id" uuid NOT NULL,"rating" integer NOT NULL,"review_text" text,"is_anonymous" boolean DEFAULT false,"created_at" timestamp with time zone NOT NULL DEFAULT now(),"score" integer DEFAULT 0,"image_url" text);
CREATE TABLE public."venue_yap_messages"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"venue_id" uuid NOT NULL,"posted_by" uuid NOT NULL,"display_as" text DEFAULT 'venue'::text,"text" text NOT NULL,"is_pinned" boolean DEFAULT false,"created_at" timestamp with time zone DEFAULT now(),"expires_at" timestamp with time zone);
CREATE TABLE public."wishlist_places"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"venue_name" text NOT NULL,"venue_image_url" text,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."yap_comment_votes"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"comment_id" uuid NOT NULL,"user_id" uuid NOT NULL,"vote_type" text NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."yap_comments"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"yap_id" uuid NOT NULL,"user_id" uuid NOT NULL,"text" text NOT NULL,"is_anonymous" boolean DEFAULT true,"author_handle" text,"created_at" timestamp with time zone DEFAULT now(),"score" integer DEFAULT 0,"is_demo" boolean DEFAULT false);
CREATE TABLE public."yap_messages"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"venue_name" text NOT NULL,"user_id" uuid NOT NULL,"text" text NOT NULL,"is_anonymous" boolean DEFAULT true,"created_at" timestamp with time zone DEFAULT now(),"expires_at" timestamp with time zone NOT NULL,"is_demo" boolean DEFAULT false,"is_promoted" boolean DEFAULT false,"score" integer DEFAULT 0,"comments_count" integer DEFAULT 0,"author_handle" text,"image_url" text,"media_type" text,"is_private_party" boolean DEFAULT false,"party_lat" double precision,"party_lng" double precision,"party_id" uuid);
CREATE TABLE public."yap_votes"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"yap_id" uuid NOT NULL,"user_id" uuid NOT NULL,"vote_type" text NOT NULL,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public."venue_aliases"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"venue_id" uuid NOT NULL,"alias" text NOT NULL,"alias_type" text NOT NULL DEFAULT 'canonical'::text,"created_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."venue_signal_scan_state"("venue_id" uuid NOT NULL,"source" text NOT NULL,"last_scanned_at" timestamp with time zone,"last_result_count" integer NOT NULL DEFAULT 0,"last_error" text,"updated_at" timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public."profiles"("id" uuid NOT NULL,"display_name" text,"username" text,"avatar_url" text,"bio" text,"created_at" timestamp with time zone DEFAULT now(),"is_demo" boolean DEFAULT false,"location_sharing_level" text DEFAULT 'all_friends'::text,"phone" text,"push_token" text,"is_private" boolean DEFAULT false,"onboarding_completed" boolean DEFAULT false,"neighborhood" text,"city" text DEFAULT 'nyc'::text,"last_known_lat" double precision,"last_known_lng" double precision,"last_location_at" timestamp with time zone,"is_out" boolean DEFAULT false,"apns_device_token" text,"push_enabled" boolean DEFAULT false,"push_subscription" jsonb,"show_read_receipts" boolean NOT NULL DEFAULT true);
CREATE TABLE public."venues"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"name" text NOT NULL,"neighborhood" text NOT NULL,"type" text NOT NULL,"lat" double precision NOT NULL,"lng" double precision NOT NULL,"is_demo" boolean DEFAULT true,"created_at" timestamp with time zone DEFAULT now(),"is_leaderboard_promoted" boolean DEFAULT false,"popularity_rank" integer DEFAULT 999,"city" text DEFAULT 'nyc'::text,"opened_at" timestamp with time zone,"google_place_id" text,"operating_hours" jsonb,"hours_last_updated" timestamp with time zone,"google_rating" numeric,"google_user_ratings_total" integer,"google_photo_refs" jsonb,"is_user_submitted" boolean DEFAULT false,"is_map_promoted" boolean DEFAULT false,"leaderboard_promo_order" integer,"leaderboard_category" text,"leaderboard_exclusion_reason" text,"leaderboard_eligible" boolean GENERATED ALWAYS AS ((COALESCE((leaderboard_category = ANY (ARRAY['bar'::text, 'club'::text])), false) AND COALESCE((type = ANY (ARRAY['bar'::text, 'cocktail_bar'::text, 'club'::text, 'nightclub'::text])), false) AND (NOT COALESCE(is_demo, false)))) STORED);
CREATE TABLE public."mux_asset_deletions"("asset_id" text NOT NULL,"queued_at" timestamp with time zone NOT NULL DEFAULT now(),"attempts" integer NOT NULL DEFAULT 0,"last_error" text);
CREATE TABLE public."location_events"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"created_at" timestamp with time zone NOT NULL DEFAULT now(),"evaluation_id" uuid NOT NULL,"user_id" uuid,"event_type" text NOT NULL,"evaluated_venue_id" uuid,"evaluated_venue_name" text,"gps_lat" numeric,"gps_lng" numeric,"gps_accuracy_meters" numeric,"distance_to_venue_meters" numeric,"dwell_time_seconds" numeric,"speed_mph" numeric,"time_of_day" smallint,"day_of_week" smallint,"user_status_before" text,"user_status_after" text,"thresholds_met" jsonb,"result" text,"friends_at_venue_count" smallint DEFAULT 0);
CREATE TABLE public."location_hidden"("id" uuid NOT NULL DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL,"hidden_from_id" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now());
ALTER TABLE public."party_locations" ADD CONSTRAINT "party_locations_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."venue_editorial_recommendations" ADD CONSTRAINT "venue_editorial_recommendations_pkey" PRIMARY KEY (venue_id, source_url);
ALTER TABLE public."leaderboard_neighborhoods" ADD CONSTRAINT "leaderboard_neighborhoods_pkey" PRIMARY KEY (city, name);
ALTER TABLE public."post_tags" ADD CONSTRAINT "post_tags_pkey" PRIMARY KEY (id);
ALTER TABLE public."posts" ADD CONSTRAINT "posts_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_leaderboard_scores" ADD CONSTRAINT "venue_leaderboard_scores_pkey" PRIMARY KEY (venue_id);
ALTER TABLE public."venue_signal_events" ADD CONSTRAINT "venue_signal_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."live_location_state" ADD CONSTRAINT "live_location_state_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."blocked_users" ADD CONSTRAINT "blocked_users_pkey" PRIMARY KEY (id);
ALTER TABLE public."dm_messages" ADD CONSTRAINT "dm_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."dm_read_receipts" ADD CONSTRAINT "dm_read_receipts_pkey" PRIMARY KEY (thread_id, user_id);
ALTER TABLE public."daily_nudges" ADD CONSTRAINT "daily_nudges_pkey" PRIMARY KEY (id);
ALTER TABLE public."dm_message_reactions" ADD CONSTRAINT "dm_message_reactions_pkey" PRIMARY KEY (id);
ALTER TABLE public."dm_thread_members" ADD CONSTRAINT "dm_thread_members_pkey" PRIMARY KEY (id);
ALTER TABLE public."dm_threads" ADD CONSTRAINT "dm_threads_pkey" PRIMARY KEY (id);
ALTER TABLE public."event_logs" ADD CONSTRAINT "event_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."event_rsvps" ADD CONSTRAINT "event_rsvps_pkey" PRIMARY KEY (id);
ALTER TABLE public."events" ADD CONSTRAINT "events_pkey" PRIMARY KEY (id);
ALTER TABLE public."friendships" ADD CONSTRAINT "friendships_pkey" PRIMARY KEY (id);
ALTER TABLE public."invite_codes" ADD CONSTRAINT "invite_codes_pkey" PRIMARY KEY (id);
ALTER TABLE public."invite_uses" ADD CONSTRAINT "invite_uses_pkey" PRIMARY KEY (id);
ALTER TABLE public."location_detection_logs" ADD CONSTRAINT "location_detection_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."plan_comments" ADD CONSTRAINT "plan_comments_pkey" PRIMARY KEY (id);
ALTER TABLE public."plan_downs" ADD CONSTRAINT "plan_downs_pkey" PRIMARY KEY (id);
ALTER TABLE public."night_statuses" ADD CONSTRAINT "night_statuses_pkey" PRIMARY KEY (id);
ALTER TABLE public."close_friends" ADD CONSTRAINT "close_friends_pkey" PRIMARY KEY (id);
ALTER TABLE public."checkins" ADD CONSTRAINT "checkins_pkey" PRIMARY KEY (id);
ALTER TABLE public."plan_participants" ADD CONSTRAINT "plan_participants_pkey" PRIMARY KEY (id);
ALTER TABLE public."plan_votes" ADD CONSTRAINT "plan_votes_pkey" PRIMARY KEY (id);
ALTER TABLE public."post_comment_likes" ADD CONSTRAINT "post_comment_likes_pkey" PRIMARY KEY (id);
ALTER TABLE public."post_comments" ADD CONSTRAINT "post_comments_pkey" PRIMARY KEY (id);
ALTER TABLE public."post_likes" ADD CONSTRAINT "post_likes_pkey" PRIMARY KEY (id);
ALTER TABLE public."plans" ADD CONSTRAINT "plans_pkey" PRIMARY KEY (id);
ALTER TABLE public."promotion_interest" ADD CONSTRAINT "promotion_interest_pkey" PRIMARY KEY (id);
ALTER TABLE public."push_logs" ADD CONSTRAINT "push_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."push_throttle" ADD CONSTRAINT "push_throttle_pkey" PRIMARY KEY (id);
ALTER TABLE public."rate_limit_actions" ADD CONSTRAINT "rate_limit_actions_pkey" PRIMARY KEY (id);
ALTER TABLE public."reports" ADD CONSTRAINT "reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."review_votes" ADD CONSTRAINT "review_votes_pkey" PRIMARY KEY (id);
ALTER TABLE public."stories" ADD CONSTRAINT "stories_pkey" PRIMARY KEY (id);
ALTER TABLE public."story_views" ADD CONSTRAINT "story_views_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_auto_corrections" ADD CONSTRAINT "venue_auto_corrections_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_buzz_messages" ADD CONSTRAINT "venue_buzz_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_claim_requests" ADD CONSTRAINT "venue_claim_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_location_reports" ADD CONSTRAINT "venue_location_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_notif_throttle" ADD CONSTRAINT "venue_notif_throttle_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_owners" ADD CONSTRAINT "venue_owners_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_promotions" ADD CONSTRAINT "venue_promotions_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_reviews" ADD CONSTRAINT "venue_reviews_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_yap_messages" ADD CONSTRAINT "venue_yap_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."wishlist_places" ADD CONSTRAINT "wishlist_places_pkey" PRIMARY KEY (id);
ALTER TABLE public."yap_comment_votes" ADD CONSTRAINT "yap_comment_votes_pkey" PRIMARY KEY (id);
ALTER TABLE public."yap_comments" ADD CONSTRAINT "yap_comments_pkey" PRIMARY KEY (id);
ALTER TABLE public."yap_messages" ADD CONSTRAINT "yap_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."yap_votes" ADD CONSTRAINT "yap_votes_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_aliases" ADD CONSTRAINT "venue_aliases_pkey" PRIMARY KEY (id);
ALTER TABLE public."venue_signal_scan_state" ADD CONSTRAINT "venue_signal_scan_state_pkey" PRIMARY KEY (venue_id, source);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."venues" ADD CONSTRAINT "venues_pkey" PRIMARY KEY (id);
ALTER TABLE public."mux_asset_deletions" ADD CONSTRAINT "mux_asset_deletions_pkey" PRIMARY KEY (asset_id);
ALTER TABLE public."location_events" ADD CONSTRAINT "location_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."location_hidden" ADD CONSTRAINT "location_hidden_pkey" PRIMARY KEY (id);
ALTER TABLE public."post_tags" ADD CONSTRAINT "post_tags_post_id_tagged_user_id_key" UNIQUE (post_id, tagged_user_id);
ALTER TABLE public."dm_message_reactions" ADD CONSTRAINT "dm_message_reactions_message_id_user_id_key" UNIQUE (message_id, user_id);
ALTER TABLE public."night_statuses" ADD CONSTRAINT "night_statuses_user_id_key" UNIQUE (user_id);
ALTER TABLE public."location_hidden" ADD CONSTRAINT "location_hidden_user_id_hidden_from_id_key" UNIQUE (user_id, hidden_from_id);
ALTER TABLE public."venue_editorial_recommendations" ADD CONSTRAINT "venue_editorial_recommendations_source_url_check" CHECK ((source_url ~ '^https://'::text));
ALTER TABLE public."leaderboard_neighborhoods" ADD CONSTRAINT "leaderboard_neighborhoods_center_lat_check" CHECK (((center_lat >= ('-90'::integer)::double precision) AND (center_lat <= (90)::double precision)));
ALTER TABLE public."leaderboard_neighborhoods" ADD CONSTRAINT "leaderboard_neighborhoods_center_lng_check" CHECK (((center_lng >= ('-180'::integer)::double precision) AND (center_lng <= (180)::double precision)));
ALTER TABLE public."leaderboard_neighborhoods" ADD CONSTRAINT "leaderboard_neighborhoods_city_check" CHECK ((city = ANY (ARRAY['nyc'::text, 'la'::text])));
ALTER TABLE public."posts" ADD CONSTRAINT "posts_mux_status_check" CHECK (((mux_status IS NULL) OR (mux_status = ANY (ARRAY['preparing'::text, 'ready'::text, 'errored'::text]))));
ALTER TABLE public."venue_signal_events" ADD CONSTRAINT "venue_signal_events_mention_count_check" CHECK ((mention_count >= 0));
ALTER TABLE public."venue_signal_events" ADD CONSTRAINT "venue_signal_events_score_check" CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)));
ALTER TABLE public."venue_signal_events" ADD CONSTRAINT "venue_signal_events_source_check" CHECK ((source = ANY (ARRAY['x'::text, 'reddit'::text, 'editorial'::text, 'google'::text, 'manual'::text, 'spotted_web'::text])));
ALTER TABLE public."venue_signal_events" ADD CONSTRAINT "venue_signal_events_weight_check" CHECK ((weight > (0)::numeric));
ALTER TABLE public."venue_aliases" ADD CONSTRAINT "venue_aliases_alias_type_check" CHECK ((alias_type = ANY (ARRAY['canonical'::text, 'internet'::text, 'manual'::text])));
ALTER TABLE public."venues" ADD CONSTRAINT "venues_leaderboard_category_check" CHECK ((leaderboard_category = ANY (ARRAY['bar'::text, 'club'::text])));
ALTER TABLE public."party_locations" ADD CONSTRAINT "party_locations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."venue_editorial_recommendations" ADD CONSTRAINT "venue_editorial_recommendations_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
ALTER TABLE public."post_tags" ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE public."post_tags" ADD CONSTRAINT "post_tags_tagged_user_id_fkey" FOREIGN KEY (tagged_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."venue_leaderboard_scores" ADD CONSTRAINT "venue_leaderboard_scores_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
ALTER TABLE public."venue_signal_events" ADD CONSTRAINT "venue_signal_events_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
ALTER TABLE public."live_location_state" ADD CONSTRAINT "live_location_state_candidate_id_fkey" FOREIGN KEY (candidate_id) REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE public."live_location_state" ADD CONSTRAINT "live_location_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."dm_messages" ADD CONSTRAINT "dm_messages_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE;
ALTER TABLE public."dm_message_reactions" ADD CONSTRAINT "dm_message_reactions_message_id_fkey" FOREIGN KEY (message_id) REFERENCES dm_messages(id) ON DELETE CASCADE;
ALTER TABLE public."dm_thread_members" ADD CONSTRAINT "dm_thread_members_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE;
ALTER TABLE public."event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE public."events" ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id);
ALTER TABLE public."plan_comments" ADD CONSTRAINT "plan_comments_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE;
ALTER TABLE public."night_statuses" ADD CONSTRAINT "night_statuses_planning_venue_id_fkey" FOREIGN KEY (planning_venue_id) REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE public."night_statuses" ADD CONSTRAINT "night_statuses_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE public."close_friends" ADD CONSTRAINT "close_friends_close_friend_id_fkey" FOREIGN KEY (close_friend_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."close_friends" ADD CONSTRAINT "close_friends_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."checkins" ADD CONSTRAINT "checkins_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE public."venue_aliases" ADD CONSTRAINT "venue_aliases_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
ALTER TABLE public."venue_signal_scan_state" ADD CONSTRAINT "venue_signal_scan_state_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
ALTER TABLE public."location_events" ADD CONSTRAINT "location_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."location_hidden" ADD CONSTRAINT "location_hidden_hidden_from_id_fkey" FOREIGN KEY (hidden_from_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."location_hidden" ADD CONSTRAINT "location_hidden_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public._can_see_location_unchecked(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT CASE
      WHEN viewer_id = target_user_id THEN true
      WHEN EXISTS (
        SELECT 1 FROM blocked_users
        WHERE (blocker_id = target_user_id AND blocked_id = viewer_id)
           OR (blocker_id = viewer_id AND blocked_id = target_user_id)
      ) THEN false
      WHEN EXISTS (
        SELECT 1 FROM location_hidden
        WHERE user_id = target_user_id AND hidden_from_id = viewer_id
      ) THEN false
      WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'close_friends' THEN
        public.is_close_friend(viewer_id, target_user_id)
      WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'all_friends' THEN
        public.is_direct_friend(viewer_id, target_user_id)
      WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'mutual_friends' THEN
        public.is_friend_or_mutual(viewer_id, target_user_id)
      ELSE false
    END
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Auth-binding guard: authenticated users may only query as themselves.
  -- Service-role / definer contexts (auth.uid() IS NULL) are unrestricted.
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN public._can_see_location_unchecked(viewer_id, target_user_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.can_see_planning(viewer_id uuid, target_user_id uuid, visibility text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Auth-binding guard (WP1 pattern)
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  -- Self always visible
  IF viewer_id = target_user_id THEN
    RETURN true;
  END IF;

  -- Block check
  IF EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = target_user_id AND blocked_id = viewer_id)
       OR (blocker_id = viewer_id AND blocked_id = target_user_id)
  ) THEN
    RETURN false;
  END IF;

  -- Hide check
  IF EXISTS (
    SELECT 1 FROM location_hidden
    WHERE user_id = target_user_id AND hidden_from_id = viewer_id
  ) THEN
    RETURN false;
  END IF;

  -- Visibility ladder
  CASE COALESCE(visibility, 'all_friends')
    WHEN 'close_friends' THEN
      RETURN public.is_close_friend(viewer_id, target_user_id);
    WHEN 'all_friends' THEN
      RETURN public.is_direct_friend(viewer_id, target_user_id);
    WHEN 'mutual_friends' THEN
      RETURN public.is_friend_or_mutual(viewer_id, target_user_id);
    ELSE
      RETURN public.is_direct_friend(viewer_id, target_user_id);
  END CASE;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_and_auto_correct_venue()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  report_count INTEGER; unique_users INTEGER; avg_lat DOUBLE PRECISION; avg_lng DOUBLE PRECISION;
  old_venue_lat DOUBLE PRECISION; old_venue_lng DOUBLE PRECISION; correction_id UUID;
  min_reports INTEGER := 5; min_users INTEGER := 3;
BEGIN
  IF NEW.report_type != 'wrong_location' OR NEW.venue_id IS NULL OR NEW.status != 'pending' THEN RETURN NEW; END IF;
  SELECT COUNT(*), COUNT(DISTINCT user_id), AVG(user_lat), AVG(user_lng)
  INTO report_count, unique_users, avg_lat, avg_lng
  FROM venue_location_reports WHERE venue_id = NEW.venue_id AND report_type = 'wrong_location' AND status = 'pending' AND created_at > NOW() - INTERVAL '72 hours';
  IF report_count >= min_reports AND unique_users >= min_users THEN
    SELECT lat, lng INTO old_venue_lat, old_venue_lng FROM venues WHERE id = NEW.venue_id;
    IF (6371000 * acos(cos(radians(avg_lat)) * cos(radians(old_venue_lat)) * cos(radians(old_venue_lng) - radians(avg_lng)) + sin(radians(avg_lat)) * sin(radians(old_venue_lat)))) > 1000 THEN RETURN NEW; END IF;
    correction_id := gen_random_uuid();
    INSERT INTO venue_auto_corrections (id, venue_id, old_lat, old_lng, new_lat, new_lng, report_count, unique_user_count) VALUES (correction_id, NEW.venue_id, old_venue_lat, old_venue_lng, avg_lat, avg_lng, report_count, unique_users);
    UPDATE venues SET lat = avg_lat, lng = avg_lng WHERE id = NEW.venue_id;
    UPDATE venue_location_reports SET status = 'auto_corrected', auto_correction_id = correction_id, auto_corrected_at = NOW() WHERE venue_id = NEW.venue_id AND report_type = 'wrong_location' AND status = 'pending' AND created_at > NOW() - INTERVAL '72 hours';
  END IF;
  RETURN NEW;
END; $function$
;
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_user_id uuid, p_action_type text, p_window_hours integer, p_max_count integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE action_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO action_count FROM rate_limit_actions
  WHERE user_id = p_user_id AND action_type = p_action_type AND created_at > NOW() - (p_window_hours || ' hours')::INTERVAL;
  RETURN action_count < p_max_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_old_checkins()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM checkins WHERE ended_at IS NOT NULL AND ended_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limit_actions WHERE created_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_venue_notif_throttle()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  DELETE FROM venue_notif_throttle WHERE notified_date < current_date - interval '2 days';
$function$
;
CREATE OR REPLACE FUNCTION public.clear_live_location_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status <> 'out' or coalesce(new.is_private_party,false)
     or new.expires_at is null or new.expires_at <= now()
     or new.updated_at is distinct from old.updated_at then
    delete from public.live_location_state where user_id = new.user_id;
  end if;
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.clear_stale_push_token(p_token text, p_keep_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles
  SET apns_device_token = NULL
  WHERE apns_device_token = p_token
    AND id <> p_keep_user_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_dm_thread(friend_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_thread_id uuid;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT dtm1.thread_id INTO new_thread_id
  FROM dm_thread_members dtm1
  JOIN dm_thread_members dtm2 ON dtm1.thread_id = dtm2.thread_id
  WHERE dtm1.user_id = current_user_id AND dtm2.user_id = friend_id LIMIT 1;
  IF new_thread_id IS NOT NULL THEN RETURN new_thread_id; END IF;
  INSERT INTO dm_threads (created_by) VALUES (current_user_id) RETURNING id INTO new_thread_id;
  INSERT INTO dm_thread_members (thread_id, user_id) VALUES (new_thread_id, current_user_id), (new_thread_id, friend_id);
  RETURN new_thread_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_group_thread(group_name text, member_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_thread_id uuid;
  current_user_id uuid;
  member_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO dm_threads (created_by, is_group, name) VALUES (current_user_id, true, group_name) RETURNING id INTO new_thread_id;
  INSERT INTO dm_thread_members (thread_id, user_id) VALUES (new_thread_id, current_user_id);
  FOREACH member_id IN ARRAY member_ids LOOP
    INSERT INTO dm_thread_members (thread_id, user_id) VALUES (new_thread_id, member_id);
  END LOOP;
  RETURN new_thread_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_notification(p_receiver_id uuid, p_type text, p_message text)
 RETURNS SETOF notifications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Block check: skip if either side has blocked the other
  IF EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = auth.uid() AND blocked_id = p_receiver_id)
       OR (blocker_id = p_receiver_id AND blocked_id = auth.uid())
  ) THEN
    RETURN;  -- silently skip
  END IF;

  RETURN QUERY
  INSERT INTO notifications (sender_id, receiver_id, type, message)
  VALUES (auth.uid(), p_receiver_id, p_type, p_message)
  RETURNING *;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_notifications_batch(p_notifications jsonb)
 RETURNS SETOF notifications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  notif jsonb;
  recv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  FOR notif IN SELECT * FROM jsonb_array_elements(p_notifications)
  LOOP
    recv_id := (notif->>'receiver_id')::uuid;

    -- Block check: skip this recipient if block exists
    IF EXISTS (
      SELECT 1 FROM blocked_users
      WHERE (blocker_id = auth.uid() AND blocked_id = recv_id)
         OR (blocker_id = recv_id AND blocked_id = auth.uid())
    ) THEN
      CONTINUE;
    END IF;

    RETURN QUERY
    INSERT INTO notifications (sender_id, receiver_id, type, message)
    VALUES (auth.uid(), recv_id, notif->>'type', notif->>'message')
    RETURNING *;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_venue_from_discovery(p_name text, p_lat double precision, p_lng double precision, p_neighborhood text, p_type text, p_city text, p_google_place_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO venues (name, lat, lng, neighborhood, type, city, google_place_id, is_demo, is_user_submitted)
  VALUES (p_name, p_lat, p_lng, p_neighborhood, p_type, p_city, p_google_place_id, false, true)
  ON CONFLICT (name) DO UPDATE SET name = venues.name
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.find_nearby_venues(user_lat double precision, user_lng double precision, radius_meters double precision, max_results integer)
 RETURNS TABLE(id uuid, name text, distance double precision)
 LANGUAGE plpgsql
AS $function$ BEGIN RETURN QUERY SELECT v.id, v.name, (6371000 * acos(cos(radians(user_lat)) * cos(radians(v.lat)) * cos(radians(v.lng) - radians(user_lng)) + sin(radians(user_lat)) * sin(radians(v.lat)))) as distance FROM venues v WHERE v.is_demo = false AND (6371000 * acos(cos(radians(user_lat)) * cos(radians(v.lat)) * cos(radians(v.lng) - radians(user_lng)) + sin(radians(user_lat)) * sin(radians(v.lat)))) <= radius_meters ORDER BY distance LIMIT max_results; END; $function$
;
CREATE OR REPLACE FUNCTION public.find_nearest_venue(user_lat double precision, user_lng double precision, radius_meters double precision)
 RETURNS TABLE(id uuid, name text, distance double precision)
 LANGUAGE plpgsql
AS $function$ BEGIN RETURN QUERY SELECT v.id, v.name, (6371000 * acos(cos(radians(user_lat)) * cos(radians(v.lat)) * cos(radians(v.lng) - radians(user_lng)) + sin(radians(user_lat)) * sin(radians(v.lat)))) as distance FROM venues v WHERE v.is_demo = false AND (6371000 * acos(cos(radians(user_lat)) * cos(radians(v.lat)) * cos(radians(v.lng) - radians(user_lng)) + sin(radians(user_lat)) * sin(radians(v.lat)))) <= radius_meters ORDER BY distance LIMIT 1; END; $function$
;
CREATE OR REPLACE FUNCTION public.get_morning_after_user_posts(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone)
 RETURNS TABLE(id uuid, text text, image_url text, media_type text, venue_name text, likes_count integer, comments_count integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
      p.id, p.text, p.image_url, p.media_type,
      p.venue_name, p.likes_count, p.comments_count, p.created_at
    FROM posts p
    WHERE
      p_user_id = auth.uid()
      AND p_window_end > now() - interval '36 hours'
      AND p.user_id = p_user_id
      AND p.is_demo = false
      AND p.created_at >= p_window_start
      AND p.created_at < p_window_end
    ORDER BY p.created_at DESC;
  $function$
;
CREATE OR REPLACE FUNCTION public.get_morning_after_yaps(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone)
 RETURNS TABLE(id uuid, text text, image_url text, media_type text, author_handle text, venue_name text, score integer, comments_count integer, created_at timestamp with time zone, is_anonymous boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
      y.id, y.text, y.image_url, y.media_type, y.author_handle,
      y.venue_name, y.score, y.comments_count, y.created_at, y.is_anonymous
    FROM yap_messages y
    WHERE
      p_user_id = auth.uid()
      AND p_window_end > now() - interval '36 hours'
      AND y.is_demo = false
      AND y.created_at >= p_window_start
      AND y.created_at < p_window_end
      AND y.venue_name IN (
        SELECT DISTINCT c.venue_name
        FROM checkins c
        WHERE c.user_id = p_user_id
          AND c.started_at >= p_window_start
          AND c.started_at < p_window_end
          AND c.is_demo = false
      )
    ORDER BY y.venue_name, y.score DESC, y.comments_count DESC, y.created_at DESC;
  $function$
;
CREATE OR REPLACE FUNCTION public.get_mutual_friend_ids(p_user_id uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN;  -- empty set
  END IF;

  RETURN QUERY
  WITH my_friends AS (
    SELECT CASE
      WHEN f.user_id = p_user_id THEN f.friend_id
      ELSE f.user_id
    END AS fid
    FROM friendships f
    WHERE (f.user_id = p_user_id OR f.friend_id = p_user_id)
      AND f.status = 'accepted'
  ),
  real_friends AS (
    SELECT mf.fid
    FROM my_friends mf
    JOIN profiles p ON p.id = mf.fid
    WHERE p.is_demo = false
  ),
  friends_of_friends AS (
    SELECT DISTINCT
      CASE
        WHEN f2.user_id = rf.fid THEN f2.friend_id
        ELSE f2.user_id
      END AS fof_id
    FROM friendships f2
    JOIN real_friends rf ON (f2.user_id = rf.fid OR f2.friend_id = rf.fid)
    WHERE f2.status = 'accepted'
  )
  SELECT fof.fof_id AS user_id
  FROM friends_of_friends fof
  JOIN profiles p ON p.id = fof.fof_id
  WHERE fof.fof_id != p_user_id
    AND fof.fof_id NOT IN (SELECT fid FROM my_friends)
    AND p.is_demo = false;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_mutual_friends_with(p_other_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, is_demo boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH my_friends AS (
    SELECT CASE
      WHEN f.user_id = auth.uid() THEN f.friend_id
      ELSE f.user_id
    END AS fid
    FROM friendships f
    WHERE (f.user_id = auth.uid() OR f.friend_id = auth.uid())
      AND f.status = 'accepted'
  ),
  their_friends AS (
    SELECT CASE
      WHEN f.user_id = p_other_id THEN f.friend_id
      ELSE f.user_id
    END AS fid
    FROM friendships f
    WHERE (f.user_id = p_other_id OR f.friend_id = p_other_id)
      AND f.status = 'accepted'
  )
  SELECT p.id, p.display_name, p.username, p.avatar_url, p.is_demo
  FROM profiles p
  JOIN my_friends mf ON mf.fid = p.id
  JOIN their_friends tf ON tf.fid = p.id
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND p.id <> p_other_id
    -- Never surface anyone in a block relationship with the caller
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = auth.uid())
    )
  ORDER BY p.display_name;
$function$
;
CREATE OR REPLACE FUNCTION public.get_neighborhood_venue_leaderboard(p_city text, p_neighborhood text, p_limit integer DEFAULT 20)
 RETURNS TABLE(venue_id uuid, name text, neighborhood text, venue_type text, lat double precision, lng double precision, google_rating numeric, google_user_ratings_total integer, internet_score numeric, checkin_score numeric, final_score numeric, unique_checkins_24h integer, unique_checkins_7d integer, trend_label text, source_count integer, computed_at timestamp with time zone, is_nearby boolean, distance_miles double precision, location_label text, editorial_sources jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with scope as (
    select * from public.leaderboard_neighborhoods
    where city=p_city and name=p_neighborhood
  ), editorial as (
    select r.venue_id, jsonb_agg(jsonb_build_object(
      'publisher',r.publisher,'title',r.source_title,'url',r.source_url,
      'published_at',r.published_at,'verified_at',r.verified_at
    ) order by r.published_at desc,r.source_url) as sources
    from public.venue_editorial_recommendations r
    join public.venues v on v.id=r.venue_id
    where r.active and r.published_at >= (current_date - interval '2 years')::date
      and v.city=p_city and v.leaderboard_eligible
    group by r.venue_id
  ), candidates as (
    select v.*, e.sources, not (v.neighborhood = any(n.included_neighborhoods)) as outside,
      3958.7613 * acos(least(1::double precision,greatest(-1::double precision,
        sin(radians(n.center_lat))*sin(radians(v.lat)) +
        cos(radians(n.center_lat))*cos(radians(v.lat))*cos(radians(v.lng-n.center_lng))
      ))) as distance
    from scope n join public.venues v on v.city=n.city
    join editorial e on e.venue_id=v.id
    where v.leaderboard_eligible and not coalesce(v.is_demo,false)
      and v.lat is not null and v.lng is not null
  )
  select v.id,v.name,v.neighborhood,v.type,v.lat,v.lng,v.google_rating,
    v.google_user_ratings_total,s.internet_score,s.checkin_score,s.final_score,
    coalesce(s.unique_checkins_24h,0),coalesce(s.unique_checkins_7d,0),s.trend_label,
    coalesce(s.source_count,0),s.computed_at,v.outside,v.distance,
    case when not v.outside then v.neighborhood
      when v.distance <= 2 then 'Nearby · ' || v.neighborhood
      else 'Elsewhere in ' || case when p_city='la' then 'LA' else 'NYC' end || ' · ' || v.neighborhood end,
    v.sources
  from candidates v left join public.venue_leaderboard_scores s on s.venue_id=v.id
  order by v.outside,
    case when v.outside then v.distance end asc,
    s.final_score desc nulls last, s.internet_score desc nulls last, v.name, v.id
  limit greatest(20,least(coalesce(p_limit,20),100));
$function$
;
CREATE OR REPLACE FUNCTION public.get_party_address(p_status_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  addr text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT party_address INTO addr
    FROM night_statuses
    WHERE user_id = p_status_user_id;

  -- Owner always sees their own address
  IF auth.uid() = p_status_user_id THEN
    RETURN addr;
  END IF;

  -- Invited friends: have a private_party_invite notification from the owner
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE type = 'private_party_invite'
      AND sender_id = p_status_user_id
      AND receiver_id = auth.uid()
  ) THEN
    RETURN addr;
  END IF;

  RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_profiles_safe()
 RETURNS TABLE(id uuid, display_name text, username text, avatar_url text, bio text, created_at timestamp with time zone, is_demo boolean, location_sharing_level text, last_known_lat double precision, last_known_lng double precision, is_out boolean, last_location_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT p.id, p.display_name, p.username, p.avatar_url, p.bio, p.created_at, p.is_demo, p.location_sharing_level, CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) THEN p.last_known_lat ELSE NULL END, CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) THEN p.last_known_lng ELSE NULL END, CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) THEN p.is_out ELSE NULL END, CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) THEN p.last_location_at ELSE NULL END FROM profiles p; $function$
;
CREATE OR REPLACE FUNCTION public.get_venue_leaderboard(p_city text DEFAULT 'nyc'::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(venue_id uuid, name text, neighborhood text, venue_type text, lat double precision, lng double precision, google_rating numeric, google_user_ratings_total integer, internet_score numeric, checkin_score numeric, final_score numeric, unique_checkins_24h integer, unique_checkins_7d integer, trend_label text, source_count integer, computed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select
    v.id,
    v.name,
    v.neighborhood,
    v.type,
    v.lat,
    v.lng,
    v.google_rating,
    v.google_user_ratings_total,
    s.internet_score,
    s.checkin_score,
    s.final_score,
    s.unique_checkins_24h,
    s.unique_checkins_7d,
    s.trend_label,
    s.source_count,
    s.computed_at
  from public.venue_leaderboard_scores s
  join public.venues v on v.id = s.venue_id
  where s.city = p_city
    and coalesce(v.is_demo, false) = false
    and v.leaderboard_eligible
    -- Use the public aggregate; raw source events are private collector data.
    and (
      v.type in ('club','nightclub')
      or s.unique_checkins_7d > 0
      or s.source_count > 0
    )
  order by s.final_score desc, s.internet_score desc, v.name asc
  limit greatest(1, least(p_limit, 100));
$function$
;
CREATE OR REPLACE FUNCTION public.get_visible_recipients(candidate_ids uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sender_id uuid := auth.uid();
BEGIN
  IF sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN ARRAY(
    SELECT c.id
    FROM unnest(candidate_ids) AS c(id)
    WHERE public._can_see_location_unchecked(c.id, sender_id)
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_is_demo_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  owner_id UUID;
  jwt_role TEXT;
BEGIN
  -- Check both PostgREST GUC and PG session role for service_role
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );

  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Determine the owner: profiles uses id, other tables use user_id
  IF TG_TABLE_NAME = 'profiles' THEN
    owner_id := NEW.id;
  ELSE
    owner_id := NEW.user_id;
  END IF;

  -- Allow only if the owner profile is already a demo user (demo-on-demo writes)
  IF NOT is_demo_user(owner_id) THEN
    RAISE EXCEPTION 'Cannot set is_demo=true: owner profile is not a demo user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.has_role(user_id uuid, role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = $1 AND ur.role = $2
  );
$function$
;
CREATE OR REPLACE FUNCTION public.invoke_mux_cleanup()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select net.http_post(
    url     := 'https://rwavbyvdytdegntdryll.supabase.co/functions/v1/mux-cleanup',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_close_friend(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM close_friends
      WHERE user_id = target_user_id
        AND close_friend_id = viewer_id
    )
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_demo_user(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT is_demo FROM profiles WHERE id = _uid),
    false
  )
$function$
;
CREATE OR REPLACE FUNCTION public.is_direct_friend(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM friendships
      WHERE status = 'accepted'
        AND (
          (user_id = viewer_id AND friend_id = target_user_id)
          OR (user_id = target_user_id AND friend_id = viewer_id)
        )
    )
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_friend_or_mutual(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN public.is_direct_friend(viewer_id, target_user_id)
      OR public.is_mutual_friend(viewer_id, target_user_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_mutual_friend(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM (
        SELECT friend_id AS fid FROM friendships
          WHERE user_id = viewer_id AND status = 'accepted'
        UNION
        SELECT user_id AS fid FROM friendships
          WHERE friend_id = viewer_id AND status = 'accepted'
      ) viewer_friends
      JOIN profiles p ON p.id = viewer_friends.fid AND p.is_demo = false
      WHERE viewer_friends.fid IN (
        SELECT friend_id FROM friendships
          WHERE user_id = target_user_id AND status = 'accepted'
        UNION
        SELECT user_id FROM friendships
          WHERE friend_id = target_user_id AND status = 'accepted'
      )
    )
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_venue_owner(user_id uuid, venue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_owners vo
    WHERE vo.user_id = $1 AND vo.venue_id = $2
  );
$function$
;
CREATE OR REPLACE FUNCTION public.live_distance_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$ select 6371000 * 2 * asin(sqrt(least(1.0,
  power(sin(radians(b_lat-a_lat)/2),2) + cos(radians(a_lat))*cos(radians(b_lat))*power(sin(radians(b_lng-a_lng)/2),2)))); $function$
;
CREATE OR REPLACE FUNCTION public.match_phones(phone_list text[])
 RETURNS TABLE(phone text, user_id uuid, display_name text, username text, avatar_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT u.phone, p.id as user_id, p.display_name, p.username, p.avatar_url FROM auth.users u JOIN profiles p ON p.id = u.id WHERE u.phone = ANY(phone_list) AND p.is_demo = false; $function$
;
CREATE OR REPLACE FUNCTION public.night_start_at(p_city text, p_at timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
AS $function$
  with tz as (
    select case
      when p_city = 'la' then 'America/Los_Angeles'
      when p_city = 'lhr' then 'Asia/Karachi'
      else 'America/New_York'
    end as name
  )
  select (
    ((p_at at time zone tz.name) - interval '5 hours')::date + time '05:00'
  ) at time zone tz.name
  from tz;
$function$
;
CREATE OR REPLACE FUNCTION public.night_status_party_location_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.is_private_party, false) then
    if new.lat is not null and new.lng is not null and new.expires_at is not null then
      insert into party_locations (user_id, lat, lng, expires_at, updated_at)
      values (new.user_id, new.lat, new.lng, new.expires_at, now())
      on conflict (user_id) do update
        set lat = excluded.lat,
            lng = excluded.lng,
            expires_at = excluded.expires_at,
            updated_at = now();
    end if;
    -- The status row keeps only the neighborhood.
    new.lat := null;
    new.lng := null;
  else
    -- Any other status ends the party: drop the exact spot.
    delete from party_locations where user_id = new.user_id;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.nightly_reset()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_conservative timestamptz := least(night_start_at('nyc', now()), night_start_at('la', now()));
  n int;
  result jsonb := '{}'::jsonb;
begin
  update profiles p
     set is_out = false,
         last_known_lat = null,
         last_known_lng = null,
         last_location_at = null
   where p.is_out = true
     and (
       not exists (
         select 1 from night_statuses s
          where s.user_id = p.id and s.status = 'out' and s.expires_at > v_now
       )
       or p.last_location_at < night_start_at(p.city, v_now)
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_locations', n);

  update checkins c
     set ended_at = v_now
   where c.ended_at is null
     and not exists (
       select 1 from night_statuses s
        where s.user_id = c.user_id and s.status = 'out' and s.expires_at > v_now
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('ended_checkins', n);

  delete from dm_messages m
   where m.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = m.sender_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_dms', n);

  update night_statuses
     set status = 'home',
         venue_name = null,
         venue_id = null,
         lat = null,
         lng = null,
         expires_at = null,
         is_private_party = false,
         party_neighborhood = null,
         party_address = null,
         planning_neighborhood = null,
         planning_venue_id = null,
         planning_venue_name = null,
         planning_visibility = null
   where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_statuses', n);

  -- Belt and braces: the trigger above already drops a party spot when its
  -- status resets, but an orphaned row must never outlive its night.
  delete from party_locations where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_party_locations', n);

  delete from posts where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_posts', n);

  delete from yap_messages where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_yaps', n);

  delete from plans where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_plans', n);

  delete from notifications x
   where x.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = x.receiver_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_notifications', n);

  raise notice '[nightly_reset] %', result;
  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.notify_post_commented()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  post_owner_id UUID;
  commenter_name TEXT;
  comment_preview TEXT;
BEGIN
  -- Get post owner
  SELECT user_id INTO post_owner_id FROM posts WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get commenter's name
  SELECT display_name INTO commenter_name FROM profiles WHERE id = NEW.user_id;

  -- Truncate comment for preview
  comment_preview := LEFT(NEW.text, 50);
  IF LENGTH(NEW.text) > 50 THEN
    comment_preview := comment_preview || '...';
  END IF;

  -- Wrap in exception handler so notification failure doesn't abort the comment
  BEGIN
    INSERT INTO notifications (sender_id, receiver_id, type, message)
    VALUES (
      NEW.user_id,
      post_owner_id,
      'post_comment',
      COALESCE(commenter_name, 'Someone') || ' commented: "' || comment_preview || '"'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log but don't abort — comment should still persist
    RAISE WARNING 'notify_post_commented failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.notify_post_liked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  post_owner_id UUID;
  liker_name TEXT;
BEGIN
  -- Get post owner
  SELECT user_id INTO post_owner_id FROM posts WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get liker's name
  SELECT display_name INTO liker_name FROM profiles WHERE id = NEW.user_id;

  -- Wrap in exception handler so notification failure doesn't abort the like
  BEGIN
    INSERT INTO notifications (sender_id, receiver_id, type, message)
    VALUES (
      NEW.user_id,
      post_owner_id,
      'post_like',
      COALESCE(liker_name, 'Someone') || ' liked your post ❤️'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_post_liked failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.on_block_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete pending friend requests between blocker and blocked
  DELETE FROM friendships
  WHERE status = 'pending'
    AND (
      (user_id = NEW.blocker_id AND friend_id = NEW.blocked_id)
      OR (user_id = NEW.blocked_id AND friend_id = NEW.blocker_id)
    );
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.process_invite_code(invite_code text, new_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  invite_record record;
  inviter_profile record;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != new_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT * INTO invite_record FROM invite_codes
  WHERE code = invite_code AND (expires_at IS NULL OR expires_at > now()) AND (max_uses IS NULL OR uses_count < max_uses);
  IF invite_record IS NULL THEN RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code'); END IF;
  IF EXISTS (SELECT 1 FROM invite_uses WHERE invited_user_id = new_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'User already used an invite');
  END IF;
  IF EXISTS (SELECT 1 FROM blocked_users WHERE (blocker_id = invite_record.user_id AND blocked_id = new_user_id) OR (blocker_id = new_user_id AND blocked_id = invite_record.user_id)) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot create friendship');
  END IF;
  INSERT INTO friendships (user_id, friend_id, status) VALUES (invite_record.user_id, new_user_id, 'accepted') ON CONFLICT DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status) VALUES (new_user_id, invite_record.user_id, 'accepted') ON CONFLICT DO NOTHING;
  INSERT INTO invite_uses (invite_code_id, inviter_id, invited_user_id) VALUES (invite_record.id, invite_record.user_id, new_user_id);
  UPDATE invite_codes SET uses_count = uses_count + 1 WHERE id = invite_record.id;
  SELECT display_name, avatar_url INTO inviter_profile FROM profiles WHERE id = invite_record.user_id;
  RETURN json_build_object('success', true, 'inviter_id', invite_record.user_id, 'inviter_name', inviter_profile.display_name, 'inviter_avatar', inviter_profile.avatar_url);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.profile_party_location_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.last_known_lat is not null or new.last_known_lng is not null)
     and exists (
       select 1 from night_statuses s
        where s.user_id = new.id
          and s.status = 'out'
          and coalesce(s.is_private_party, false)
          and s.expires_at > now()
     ) then
    new.last_known_lat := null;
    new.last_known_lng := null;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.queue_mux_asset_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.mux_asset_id is not null then
    insert into mux_asset_deletions (asset_id)
    values (old.mux_asset_id)
    on conflict (asset_id) do nothing;
  end if;
  return old;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.queue_replaced_mux_asset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.mux_asset_id is not null and old.mux_asset_id is distinct from new.mux_asset_id then
    insert into mux_asset_deletions (asset_id)
    values (old.mux_asset_id)
    on conflict (asset_id) do nothing;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.record_live_location(p_lat double precision, p_lng double precision, p_accuracy double precision, p_recorded_at timestamp with time zone, p_status_updated_at timestamp with time zone, p_speed double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  s public.night_statuses%rowtype;
  st public.live_location_state%rowtype;
  profile public.profiles%rowtype;
  nearest record;
  second_distance double precision;
  current_distance double precision;
  elapsed double precision;
  changed boolean := false;
  needs_sample boolean := false;
  departed boolean := false;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_lat is null or not (p_lat between -90 and 90)
     or p_lng is null or not (p_lng between -180 and 180)
     or p_accuracy is null or not (p_accuracy between 0 and 65)
     or p_recorded_at is null or p_recorded_at < now()-interval '2 minutes'
     or p_recorded_at > now()+interval '15 seconds' then
    return jsonb_build_object('status','invalid');
  end if;

  -- Serialize with status edits: permission, expiry and revision are checked
  -- INSIDE the same transaction as the profile and check-in writes.
  select * into s from public.night_statuses where user_id=uid for update;
  if not found or s.status <> 'out' or coalesce(s.is_private_party,false)
     or s.expires_at is null or s.expires_at <= now() then
    return jsonb_build_object('status','stopped');
  end if;
  if p_status_updated_at is null or s.updated_at is distinct from p_status_updated_at
     or p_recorded_at < s.updated_at then
    return jsonb_build_object('status','conflict');
  end if;

  select * into profile from public.profiles where id=uid for update;
  if not found then return jsonb_build_object('status','stopped'); end if;
  if profile.last_location_at is not null and p_recorded_at <= profile.last_location_at then
    return jsonb_build_object('status','ignored');
  end if;
  elapsed := extract(epoch from p_recorded_at-profile.last_location_at);
  if elapsed > 0 and elapsed < 120 and profile.last_known_lat is not null
     and profile.last_known_lng is not null
     and public.live_distance_m(profile.last_known_lat,profile.last_known_lng,p_lat,p_lng) > greatest(200,elapsed*90) then
    return jsonb_build_object('status','invalid'); -- impossible short-interval jump
  end if;

  insert into public.live_location_state(user_id,status_revision,expires_at)
    values(uid,s.updated_at,s.expires_at) on conflict(user_id) do nothing;
  select * into st from public.live_location_state where user_id=uid for update;
  if st.status_revision is distinct from s.updated_at then
    st.candidate_id := null; st.candidate_since := null; st.candidate_last_at := null;
    st.candidate_samples := 0; st.departure_since := null; st.last_recorded_at := null;
  end if;

  -- Every timestamp means an actual accepted sample, never "app is alive".
  update public.profiles set last_known_lat=p_lat,last_known_lng=p_lng,
    last_location_at=p_recorded_at,is_out=true where id=uid;

  if s.venue_id is not null then
    select public.live_distance_m(p_lat,p_lng,v.lat,v.lng) into current_distance
      from public.venues v where v.id=s.venue_id;
  elsif s.lat is not null and s.lng is not null then
    current_distance := public.live_distance_m(p_lat,p_lng,s.lat,s.lng);
  end if;

  -- Only a good, physically nearby fix refreshes the active venue's presence.
  if current_distance <= 120 and p_accuracy <= 35 then
    update public.checkins set last_updated_at=p_recorded_at
      where user_id=uid and ended_at is null and venue_id is not distinct from s.venue_id;
  end if;

  if p_accuracy <= 35 then
    -- Departure is separate from arrival: someone in transit must stop being
    -- counted at the old bar even if their next destination isn't in our list.
    if (s.venue_id is not null or nullif(s.venue_name,'') is not null) and current_distance > 150+p_accuracy then
      if st.departure_since is null or st.last_recorded_at < p_recorded_at-interval '90 seconds' then
        st.departure_since := p_recorded_at;
      elsif p_recorded_at-st.departure_since >= interval '30 seconds' then
        update public.checkins set ended_at=p_recorded_at where user_id=uid and ended_at is null;
        update public.night_statuses set venue_id=null,venue_name=null,lat=p_lat,lng=p_lng where user_id=uid;
        s.venue_id := null; s.venue_name := null;
        departed := true; st.departure_since := null;
      end if;
      needs_sample := not departed;
    else
      st.departure_since := null;
    end if;

    -- Never automatically place people in restaurants, stadiums or a passing
    -- car. Ambiguous neighboring venues keep the last confirmed venue (or Out).
    if s.automatic_venue_updates and coalesce(p_speed,0) <= 2.5 then
      select v.id,v.name,public.live_distance_m(p_lat,p_lng,v.lat,v.lng) as distance
        into nearest from public.venues v
        where v.is_demo=false and v.city=profile.city
          and v.type in ('bar','cocktail_bar','club','nightclub','lounge','rooftop','members_club')
          and abs(v.lat-p_lat) < 0.003 and abs(v.lng-p_lng) < 0.005
        order by public.live_distance_m(p_lat,p_lng,v.lat,v.lng),v.id limit 1;
      if found then
        select min(public.live_distance_m(p_lat,p_lng,v.lat,v.lng)) into second_distance
          from public.venues v where v.id<>nearest.id and v.is_demo=false and v.city=profile.city
            and v.type in ('bar','cocktail_bar','club','nightclub','lounge','rooftop','members_club')
            and abs(v.lat-p_lat) < 0.003 and abs(v.lng-p_lng) < 0.005;
        if nearest.id is distinct from s.venue_id and nearest.distance <= 80
           and (second_distance is null or second_distance-nearest.distance >= greatest(25,p_accuracy))
           and (s.venue_id is null or current_distance > greatest(60,2*p_accuracy)) then
          if st.candidate_id is distinct from nearest.id or st.candidate_last_at is null
             or p_recorded_at-st.candidate_last_at > interval '60 seconds' then
            st.candidate_id := nearest.id; st.candidate_since := p_recorded_at;
            st.candidate_samples := 1;
          elsif p_recorded_at-st.candidate_last_at >= interval '10 seconds' then
            st.candidate_samples := st.candidate_samples+1;
          end if;
          st.candidate_last_at := p_recorded_at;
          needs_sample := true;
          if st.candidate_samples >= 3 and p_recorded_at-st.candidate_since >= interval '75 seconds' then
            update public.checkins set ended_at=p_recorded_at where user_id=uid and ended_at is null;
            insert into public.checkins(user_id,venue_id,venue_name,lat,lng,started_at,last_updated_at)
              values(uid,nearest.id,nearest.name,p_lat,p_lng,p_recorded_at,p_recorded_at);
            update public.night_statuses set venue_id=nearest.id,venue_name=nearest.name,
              lat=p_lat,lng=p_lng where user_id=uid;
            s.venue_id := nearest.id; s.venue_name := nearest.name;
            changed := true; needs_sample := false;
            st.candidate_id := null; st.candidate_since := null;
            st.candidate_last_at := null; st.candidate_samples := 0;
          end if;
        else
          st.candidate_id := null; st.candidate_since := null;
          st.candidate_last_at := null; st.candidate_samples := 0;
        end if;
      else
        st.candidate_id := null; st.candidate_since := null;
        st.candidate_last_at := null; st.candidate_samples := 0;
      end if;
    else
      st.candidate_id := null; st.candidate_since := null;
      st.candidate_last_at := null; st.candidate_samples := 0;
    end if;
  else
    st.candidate_id := null; st.candidate_since := null;
    st.candidate_last_at := null; st.candidate_samples := 0; st.departure_since := null;
  end if;

  update public.live_location_state set status_revision=s.updated_at,
    candidate_id=st.candidate_id,candidate_since=st.candidate_since,
    candidate_last_at=st.candidate_last_at,candidate_samples=st.candidate_samples,
    departure_since=st.departure_since,last_recorded_at=p_recorded_at,expires_at=s.expires_at
    where user_id=uid;
  return jsonb_build_object('status','accepted','venue_changed',changed,'departed',departed,
    'needs_sample',needs_sample,'venue_id',s.venue_id,'venue_name',s.venue_name);
end; $function$
;
CREATE OR REPLACE FUNCTION public.record_rate_limited_action(p_action_type text, p_window_hours integer, p_max_count integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  current_user_id UUID;
  action_count INTEGER;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN RETURN false; END IF;
  SELECT COUNT(*) INTO action_count FROM rate_limit_actions WHERE user_id = current_user_id AND action_type = p_action_type AND created_at > NOW() - (p_window_hours || ' hours')::INTERVAL;
  IF action_count >= p_max_count THEN RETURN false; END IF;
  INSERT INTO rate_limit_actions (user_id, action_type) VALUES (current_user_id, p_action_type);
  RETURN true;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_yap_comments_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    update yap_messages set comments_count = coalesce(comments_count, 0) + 1 where id = new.yap_id;
    return new;
  elsif tg_op = 'DELETE' then
    update yap_messages set comments_count = greatest(coalesce(comments_count, 0) - 1, 0) where id = old.yap_id;
    return old;
  end if;
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.post_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.post_comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.comment_id;
  END IF; RETURN NULL;
END; $function$
;
CREATE OR REPLACE FUNCTION public.update_plan_comments_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.plans SET comments_count = comments_count + 1 WHERE id = NEW.plan_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.plans SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.plan_id;
  END IF; RETURN NULL;
END; $function$
;
CREATE OR REPLACE FUNCTION public.update_plan_score()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.plans SET score = score + CASE WHEN NEW.vote_type = 'up' THEN 1 ELSE -1 END WHERE id = NEW.plan_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.plans SET score = score - CASE WHEN OLD.vote_type = 'up' THEN 1 ELSE -1 END WHERE id = OLD.plan_id;
  ELSIF TG_OP = 'UPDATE' THEN UPDATE public.plans SET score = score - CASE WHEN OLD.vote_type = 'up' THEN 1 ELSE -1 END + CASE WHEN NEW.vote_type = 'up' THEN 1 ELSE -1 END WHERE id = NEW.plan_id;
  END IF; RETURN NULL;
END; $function$
;
CREATE OR REPLACE FUNCTION public.update_post_comments_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
  END IF; RETURN NULL;
END; $function$
;
CREATE OR REPLACE FUNCTION public.update_post_likes_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
  END IF; RETURN NULL;
END; $function$
;
CREATE OR REPLACE FUNCTION public.update_yap_comments_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE yap_messages SET comments_count = comments_count + 1 WHERE id = NEW.yap_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE yap_messages SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.yap_id;
  END IF; RETURN NULL;
END; $function$
;
CREATE OR REPLACE FUNCTION public.user_is_thread_member(thread_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM dm_thread_members
    WHERE thread_id = thread_uuid AND user_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION public.validate_invite_code(code_to_check text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  invite_record RECORD;
  inviter_profile RECORD;
BEGIN
  SELECT id, user_id, uses_count, max_uses, expires_at INTO invite_record FROM invite_codes WHERE code = code_to_check;
  IF invite_record IS NULL THEN RETURN jsonb_build_object('valid', false, 'reason', 'Code not found'); END IF;
  IF invite_record.expires_at IS NOT NULL AND invite_record.expires_at < NOW() THEN RETURN jsonb_build_object('valid', false, 'reason', 'Code expired'); END IF;
  IF invite_record.max_uses IS NOT NULL AND invite_record.uses_count >= invite_record.max_uses THEN RETURN jsonb_build_object('valid', false, 'reason', 'Code fully used'); END IF;
  SELECT display_name, avatar_url, username INTO inviter_profile FROM profiles WHERE id = invite_record.user_id;
  IF inviter_profile IS NULL THEN RETURN jsonb_build_object('valid', false, 'reason', 'Inviter not found'); END IF;
  RETURN jsonb_build_object('valid', true, 'inviter_display_name', inviter_profile.display_name, 'inviter_avatar_url', inviter_profile.avatar_url, 'inviter_username', inviter_profile.username);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.verify_venue_collector_secret(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'extensions', 'pg_catalog'
AS $function$
  select coalesce(
    encode(extensions.digest(p_secret, 'sha256'), 'hex') =
      (select secret_sha256 from internal.venue_collector_config where id = 1),
    false
  );
$function$
;
CREATE OR REPLACE FUNCTION public.vote_on_yap(p_yap_id uuid, p_vote_type text)
 RETURNS TABLE(score integer, user_vote text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_existing text;
  v_delta int := 0;
  v_vote text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_vote_type not in ('up', 'down') then
    raise exception 'invalid vote type %', p_vote_type;
  end if;

  -- Serialise concurrent taps on the same yap from the same user.
  perform 1 from yap_messages where id = p_yap_id for update;
  if not found then
    raise exception 'yap not found' using errcode = 'P0002';
  end if;

  select vote_type into v_existing
    from yap_votes where yap_id = p_yap_id and user_id = v_user;

  if v_existing = p_vote_type then
    -- toggle off
    delete from yap_votes where yap_id = p_yap_id and user_id = v_user;
    v_delta := case when p_vote_type = 'up' then -1 else 1 end;
    v_vote := null;
  elsif v_existing is not null then
    -- switch
    update yap_votes set vote_type = p_vote_type
     where yap_id = p_yap_id and user_id = v_user;
    v_delta := case when p_vote_type = 'up' then 2 else -2 end;
    v_vote := p_vote_type;
  else
    insert into yap_votes (yap_id, user_id, vote_type) values (p_yap_id, v_user, p_vote_type);
    v_delta := case when p_vote_type = 'up' then 1 else -1 end;
    v_vote := p_vote_type;
  end if;

  update yap_messages m set score = coalesce(m.score, 0) + v_delta where m.id = p_yap_id;

  return query
    select m.score, v_vote from yap_messages m where m.id = p_yap_id;
end;
$function$
;
CREATE UNIQUE INDEX IF NOT EXISTS party_locations_pkey ON public.party_locations USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_editorial_recommendations_pkey ON public.venue_editorial_recommendations USING btree (venue_id, source_url);
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_neighborhoods_pkey ON public.leaderboard_neighborhoods USING btree (city, name);
CREATE UNIQUE INDEX IF NOT EXISTS post_tags_pkey ON public.post_tags USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS post_tags_post_id_tagged_user_id_key ON public.post_tags USING btree (post_id, tagged_user_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_post ON public.post_tags USING btree (post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_user ON public.post_tags USING btree (tagged_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS posts_pkey ON public.posts USING btree (id);
CREATE INDEX IF NOT EXISTS posts_mux_upload_id_idx ON public.posts USING btree (mux_upload_id) WHERE (mux_upload_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS posts_mux_asset_id_idx ON public.posts USING btree (mux_asset_id) WHERE (mux_asset_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS venue_leaderboard_scores_pkey ON public.venue_leaderboard_scores USING btree (venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_leaderboard_scores_city_final ON public.venue_leaderboard_scores USING btree (city, final_score DESC, computed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS venue_signal_events_pkey ON public.venue_signal_events USING btree (id);
CREATE INDEX IF NOT EXISTS idx_venue_signal_events_venue_observed ON public.venue_signal_events USING btree (venue_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_signal_events_source_observed ON public.venue_signal_events USING btree (source, observed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_signal_events_external ON public.venue_signal_events USING btree (venue_id, source, external_id) WHERE (external_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS live_location_state_pkey ON public.live_location_state USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_users_pkey ON public.blocked_users USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS dm_messages_pkey ON public.dm_messages USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS dm_read_receipts_pkey ON public.dm_read_receipts USING btree (thread_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_nudges_pkey ON public.daily_nudges USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS dm_message_reactions_pkey ON public.dm_message_reactions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS dm_message_reactions_message_id_user_id_key ON public.dm_message_reactions USING btree (message_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS dm_thread_members_pkey ON public.dm_thread_members USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS dm_threads_pkey ON public.dm_threads USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS event_logs_pkey ON public.event_logs USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS event_rsvps_pkey ON public.event_rsvps USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS events_pkey ON public.events USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pkey ON public.friendships USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS invite_codes_pkey ON public.invite_codes USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS invite_uses_pkey ON public.invite_uses USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS location_detection_logs_pkey ON public.location_detection_logs USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_pkey ON public.notifications USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS plan_comments_pkey ON public.plan_comments USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS plan_downs_pkey ON public.plan_downs USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS night_statuses_pkey ON public.night_statuses USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS night_statuses_user_id_key ON public.night_statuses USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS close_friends_pkey ON public.close_friends USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS close_friends_user_pair_uniq ON public.close_friends USING btree (user_id, close_friend_id);
CREATE UNIQUE INDEX IF NOT EXISTS checkins_pkey ON public.checkins USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS plan_participants_pkey ON public.plan_participants USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS plan_votes_pkey ON public.plan_votes USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS post_comment_likes_pkey ON public.post_comment_likes USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS post_comments_pkey ON public.post_comments USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS post_likes_pkey ON public.post_likes USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS plans_pkey ON public.plans USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS promotion_interest_pkey ON public.promotion_interest USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS push_logs_pkey ON public.push_logs USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS push_throttle_pkey ON public.push_throttle USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS rate_limit_actions_pkey ON public.rate_limit_actions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS reports_pkey ON public.reports USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS review_votes_pkey ON public.review_votes USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS stories_pkey ON public.stories USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS story_views_pkey ON public.story_views USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_pkey ON public.user_roles USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_auto_corrections_pkey ON public.venue_auto_corrections USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_buzz_messages_pkey ON public.venue_buzz_messages USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_claim_requests_pkey ON public.venue_claim_requests USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_location_reports_pkey ON public.venue_location_reports USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_notif_throttle_pkey ON public.venue_notif_throttle USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_owners_pkey ON public.venue_owners USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_promotions_pkey ON public.venue_promotions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_reviews_pkey ON public.venue_reviews USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_yap_messages_pkey ON public.venue_yap_messages USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS wishlist_places_pkey ON public.wishlist_places USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS yap_comment_votes_pkey ON public.yap_comment_votes USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS yap_comments_pkey ON public.yap_comments USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS yap_messages_pkey ON public.yap_messages USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS yap_votes_pkey ON public.yap_votes USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_aliases_pkey ON public.venue_aliases USING btree (id);
CREATE INDEX IF NOT EXISTS idx_venue_aliases_venue_id ON public.venue_aliases USING btree (venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_aliases_alias_lower ON public.venue_aliases USING btree (lower(alias));
CREATE UNIQUE INDEX IF NOT EXISTS venue_signal_scan_state_pkey ON public.venue_signal_scan_state USING btree (venue_id, source);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS venues_pkey ON public.venues USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS mux_asset_deletions_pkey ON public.mux_asset_deletions USING btree (asset_id);
CREATE UNIQUE INDEX IF NOT EXISTS location_events_pkey ON public.location_events USING btree (id);
CREATE INDEX IF NOT EXISTS idx_location_events_user_id ON public.location_events USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_location_events_evaluation_id ON public.location_events USING btree (evaluation_id);
CREATE INDEX IF NOT EXISTS idx_location_events_event_type ON public.location_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_location_events_created_at ON public.location_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_events_venue ON public.location_events USING btree (evaluated_venue_id);
CREATE UNIQUE INDEX IF NOT EXISTS location_hidden_pkey ON public.location_hidden USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS location_hidden_user_id_hidden_from_id_key ON public.location_hidden USING btree (user_id, hidden_from_id);
CREATE INDEX IF NOT EXISTS idx_location_hidden_lookup ON public.location_hidden USING btree (user_id, hidden_from_id);
ALTER TABLE public."party_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_editorial_recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."leaderboard_neighborhoods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."post_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_leaderboard_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_signal_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."live_location_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."blocked_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dm_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dm_read_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."daily_nudges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dm_message_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dm_thread_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dm_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."event_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."event_rsvps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."friendships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invite_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invite_uses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."location_detection_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."plan_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."plan_downs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."night_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."close_friends" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."checkins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."plan_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."plan_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."post_comment_likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."post_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."post_likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."promotion_interest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_throttle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rate_limit_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."review_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."story_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_auto_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_buzz_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_claim_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_location_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_notif_throttle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_owners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_promotions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_yap_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wishlist_places" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."yap_comment_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."yap_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."yap_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."yap_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venue_signal_scan_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."venues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mux_asset_deletions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."location_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."location_hidden" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can block others" ON public."blocked_users" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = blocker_id));
CREATE POLICY "Users can unblock" ON public."blocked_users" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = blocker_id));
CREATE POLICY "Users can view own blocks" ON public."blocked_users" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = blocker_id) OR (auth.uid() = blocked_id)));
CREATE POLICY "Checkins viewable by authorized users" ON public."checkins" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = user_id) OR can_see_location(auth.uid(), user_id)));
CREATE POLICY "Checkins viewable by friends" ON public."checkins" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = user_id) OR (can_see_location(auth.uid(), user_id) AND (started_at > (now() - '30 days'::interval)))));
CREATE POLICY "Demo checkins are visible to authenticated users" ON public."checkins" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_demo_user(user_id));
CREATE POLICY "Users can create own checkins" ON public."checkins" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own checkins" ON public."checkins" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own checkins" ON public."checkins" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "close_friends_delete_own" ON public."close_friends" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "close_friends_insert_own" ON public."close_friends" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "close_friends_select_own" ON public."close_friends" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own nudges" ON public."daily_nudges" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own nudges" ON public."daily_nudges" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own nudges" ON public."daily_nudges" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Thread members can add reactions" ON public."dm_message_reactions" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM (dm_messages m
     JOIN dm_thread_members tm ON ((tm.thread_id = m.thread_id)))
  WHERE ((m.id = dm_message_reactions.message_id) AND (tm.user_id = auth.uid()))))));
CREATE POLICY "Thread members can view reactions" ON public."dm_message_reactions" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM (dm_messages m
     JOIN dm_thread_members tm ON ((tm.thread_id = m.thread_id)))
  WHERE ((m.id = dm_message_reactions.message_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY "Users can delete own reactions" ON public."dm_message_reactions" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can send messages" ON public."dm_messages" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM dm_thread_members
  WHERE ((dm_thread_members.thread_id = dm_messages.thread_id) AND (dm_thread_members.user_id = auth.uid())))) AND (NOT (EXISTS ( SELECT 1
   FROM blocked_users
  WHERE (((blocked_users.blocker_id IN ( SELECT dtm.user_id
           FROM dm_thread_members dtm
          WHERE ((dtm.thread_id = dm_messages.thread_id) AND (dtm.user_id <> auth.uid())))) AND (blocked_users.blocked_id = auth.uid())) OR ((blocked_users.blocker_id = auth.uid()) AND (blocked_users.blocked_id IN ( SELECT dtm.user_id
           FROM dm_thread_members dtm
          WHERE ((dtm.thread_id = dm_messages.thread_id) AND (dtm.user_id <> auth.uid())))))))))));
CREATE POLICY "Users can view messages in own threads" ON public."dm_messages" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM dm_thread_members
  WHERE ((dm_thread_members.thread_id = dm_messages.thread_id) AND (dm_thread_members.user_id = auth.uid())))));
CREATE POLICY "Thread members can view read receipts" ON public."dm_read_receipts" AS PERMISSIVE FOR SELECT TO "public" USING (user_is_thread_member(thread_id));
CREATE POLICY "Users can upsert own read receipt" ON public."dm_read_receipts" AS PERMISSIVE FOR ALL TO "public" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Only functions can add thread members" ON public."dm_thread_members" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (false);
CREATE POLICY "Users can view members of their threads" ON public."dm_thread_members" AS PERMISSIVE FOR SELECT TO "public" USING (user_is_thread_member(thread_id));
CREATE POLICY "Users can create threads" ON public."dm_threads" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Users can view own threads" ON public."dm_threads" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM dm_thread_members
  WHERE ((dm_thread_members.thread_id = dm_threads.id) AND (dm_thread_members.user_id = auth.uid())))));
CREATE POLICY "Users can insert own logs" ON public."event_logs" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can read own logs" ON public."event_logs" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "RSVPs are readable by authenticated users" ON public."event_rsvps" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Users can create their own RSVPs" ON public."event_rsvps" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own RSVPs" ON public."event_rsvps" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own RSVPs" ON public."event_rsvps" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Admins can manage all events" ON public."events" AS PERMISSIVE FOR ALL TO "public" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Events are readable by authenticated users" ON public."events" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Users can create events" ON public."events" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() IS NOT NULL) AND (created_by = auth.uid()) AND ((is_demo = false) OR (is_demo IS NULL))));
CREATE POLICY "Users can delete own events" ON public."events" AS PERMISSIVE FOR DELETE TO "public" USING ((created_by = auth.uid()));
CREATE POLICY "Users can update own events" ON public."events" AS PERMISSIVE FOR UPDATE TO "public" USING ((created_by = auth.uid())) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Venue owners can manage events" ON public."events" AS PERMISSIVE FOR ALL TO "public" USING (((venue_id IS NOT NULL) AND is_venue_owner(auth.uid(), venue_id))) WITH CHECK (((venue_id IS NOT NULL) AND is_venue_owner(auth.uid(), venue_id)));
CREATE POLICY "Users can create friendships" ON public."friendships" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own friendships" ON public."friendships" AS PERMISSIVE FOR DELETE TO "public" USING (((auth.uid() = user_id) OR (auth.uid() = friend_id)));
CREATE POLICY "Users can update own friendships" ON public."friendships" AS PERMISSIVE FOR UPDATE TO "public" USING (((auth.uid() = user_id) OR (auth.uid() = friend_id)));
CREATE POLICY "Users can view own friendships" ON public."friendships" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = user_id) OR (auth.uid() = friend_id)));
CREATE POLICY "Users can create invite codes" ON public."invite_codes" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own invite codes" ON public."invite_codes" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own invite codes" ON public."invite_codes" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Authenticated users can insert own invite use" ON public."invite_uses" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = invited_user_id)));
CREATE POLICY "Users can view invites they sent" ON public."invite_uses" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = inviter_id));
CREATE POLICY "Authenticated users read leaderboard neighborhoods" ON public."leaderboard_neighborhoods" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Own live location state" ON public."live_location_state" AS PERMISSIVE FOR ALL TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Admins can view all logs" ON public."location_detection_logs" AS PERMISSIVE FOR SELECT TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create their own logs" ON public."location_detection_logs" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view their own logs" ON public."location_detection_logs" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own location events" ON public."location_events" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can read own location events" ON public."location_events" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can hide from others" ON public."location_hidden" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can unhide" ON public."location_hidden" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own hides" ON public."location_hidden" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Demo statuses are visible to authenticated users" ON public."night_statuses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_demo_user(user_id));
CREATE POLICY "Night statuses viewable by authorized users" ON public."night_statuses" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = user_id) OR can_see_location(auth.uid(), user_id)));
CREATE POLICY "Night statuses viewable by friends" ON public."night_statuses" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = user_id) OR
CASE
    WHEN (status = 'planning'::night_status_enum) THEN can_see_planning(auth.uid(), user_id, planning_visibility)
    ELSE can_see_location(auth.uid(), user_id)
END));
CREATE POLICY "Users can manage own status" ON public."night_statuses" AS PERMISSIVE FOR ALL TO "public" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Only server can create notifications" ON public."notifications" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (false);
CREATE POLICY "Senders can delete own unread notifications" ON public."notifications" AS PERMISSIVE FOR DELETE TO "public" USING (((auth.uid() = sender_id) AND (is_read = false)));
CREATE POLICY "Senders can view sent notifications" ON public."notifications" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = sender_id));
CREATE POLICY "Users can delete own received notifications" ON public."notifications" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = receiver_id));
CREATE POLICY "Users can update received notifications" ON public."notifications" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = receiver_id));
CREATE POLICY "Users can view received notifications" ON public."notifications" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = receiver_id));
CREATE POLICY "Party location: self delete" ON public."party_locations" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Party location: self insert" ON public."party_locations" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Party location: self or close friend" ON public."party_locations" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = user_id) OR (can_see_location(auth.uid(), user_id) AND is_close_friend(auth.uid(), user_id))));
CREATE POLICY "Party location: self update" ON public."party_locations" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Plan comments viewable" ON public."plan_comments" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_comments.plan_id) AND ((auth.uid() = plans.user_id) OR (EXISTS ( SELECT 1
           FROM friendships
          WHERE ((((friendships.user_id = auth.uid()) AND (friendships.friend_id = plans.user_id)) OR ((friendships.friend_id = auth.uid()) AND (friendships.user_id = plans.user_id))) AND (friendships.status = 'accepted'::friendship_status_enum)))))))));
CREATE POLICY "Users can create plan comments" ON public."plan_comments" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own plan comments" ON public."plan_comments" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Anyone can view plan downs" ON public."plan_downs" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Users can add their own downs" ON public."plan_downs" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can remove their own downs" ON public."plan_downs" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Participants viewable on visible plans" ON public."plan_participants" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_participants.plan_id) AND ((auth.uid() = plans.user_id) OR ((plans.visibility = 'friends'::text) AND (EXISTS ( SELECT 1
           FROM friendships
          WHERE ((((friendships.user_id = auth.uid()) AND (friendships.friend_id = plans.user_id)) OR ((friendships.friend_id = auth.uid()) AND (friendships.user_id = plans.user_id))) AND (friendships.status = 'accepted'::friendship_status_enum))))) OR ((plans.visibility = 'close_friends'::text) AND is_close_friend(auth.uid(), plans.user_id)))))));
CREATE POLICY "Plan owners can add participants" ON public."plan_participants" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_participants.plan_id) AND (plans.user_id = auth.uid())))));
CREATE POLICY "Plan owners can remove participants" ON public."plan_participants" AS PERMISSIVE FOR DELETE TO "public" USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_participants.plan_id) AND (plans.user_id = auth.uid())))));
CREATE POLICY "Anyone can view plan votes" ON public."plan_votes" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Users can create plan votes" ON public."plan_votes" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own plan votes" ON public."plan_votes" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own plan votes" ON public."plan_votes" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Plans viewable by friends" ON public."plans" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = user_id) OR ((visibility = 'friends'::text) AND (EXISTS ( SELECT 1
   FROM friendships
  WHERE ((((friendships.user_id = auth.uid()) AND (friendships.friend_id = plans.user_id)) OR ((friendships.friend_id = auth.uid()) AND (friendships.user_id = plans.user_id))) AND (friendships.status = 'accepted'::friendship_status_enum))))) OR ((visibility = 'close_friends'::text) AND is_close_friend(auth.uid(), user_id))));
CREATE POLICY "Users can create own plans" ON public."plans" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own plans" ON public."plans" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own plans" ON public."plans" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Anyone can view comment likes" ON public."post_comment_likes" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Users can like comments" ON public."post_comment_likes" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can unlike their own likes" ON public."post_comment_likes" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can create comments on visible posts" ON public."post_comments" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM posts
  WHERE ((posts.id = post_comments.post_id) AND ((posts.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM friendships
          WHERE ((((friendships.user_id = auth.uid()) AND (friendships.friend_id = posts.user_id)) OR ((friendships.friend_id = auth.uid()) AND (friendships.user_id = posts.user_id))) AND (friendships.status = 'accepted'::friendship_status_enum)))) OR ((posts.visibility = 'mutual_friends'::text) AND (posts.user_id IN ( SELECT get_mutual_friend_ids(auth.uid()) AS get_mutual_friend_ids)))))))));
CREATE POLICY "Users can delete own comments" ON public."post_comments" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can view comments on visible posts" ON public."post_comments" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM posts
  WHERE ((posts.id = post_comments.post_id) AND ((posts.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM friendships
          WHERE ((((friendships.user_id = auth.uid()) AND (friendships.friend_id = posts.user_id)) OR ((friendships.friend_id = auth.uid()) AND (friendships.user_id = posts.user_id))) AND (friendships.status = 'accepted'::friendship_status_enum)))) OR ((posts.visibility = 'mutual_friends'::text) AND (posts.user_id IN ( SELECT get_mutual_friend_ids(auth.uid()) AS get_mutual_friend_ids))))))));
CREATE POLICY "Users can like visible posts" ON public."post_likes" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM posts
  WHERE ((posts.id = post_likes.post_id) AND ((posts.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM friendships
          WHERE ((((friendships.user_id = auth.uid()) AND (friendships.friend_id = posts.user_id)) OR ((friendships.friend_id = auth.uid()) AND (friendships.user_id = posts.user_id))) AND (friendships.status = 'accepted'::friendship_status_enum)))) OR ((posts.visibility = 'mutual_friends'::text) AND (posts.user_id IN ( SELECT get_mutual_friend_ids(auth.uid()) AS get_mutual_friend_ids)))))))));
CREATE POLICY "Users can unlike their own likes" ON public."post_likes" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can view likes on visible posts" ON public."post_likes" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM posts
  WHERE ((posts.id = post_likes.post_id) AND ((posts.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM friendships
          WHERE ((((friendships.user_id = auth.uid()) AND (friendships.friend_id = posts.user_id)) OR ((friendships.friend_id = auth.uid()) AND (friendships.user_id = posts.user_id))) AND (friendships.status = 'accepted'::friendship_status_enum)))) OR ((posts.visibility = 'mutual_friends'::text) AND (posts.user_id IN ( SELECT get_mutual_friend_ids(auth.uid()) AS get_mutual_friend_ids))))))));
CREATE POLICY "Author or tagged person removes a tag" ON public."post_tags" AS PERMISSIVE FOR DELETE TO "public" USING (((tagged_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_tags.post_id) AND (p.user_id = auth.uid()))))));
CREATE POLICY "Authors tag their own friends" ON public."post_tags" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_tags.post_id) AND (p.user_id = auth.uid())))) AND is_direct_friend(auth.uid(), tagged_user_id)));
CREATE POLICY "Tags viewable with the post" ON public."post_tags" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_tags.post_id) AND ((p.user_id = auth.uid()) OR
        CASE p.visibility
            WHEN 'close_friends'::text THEN is_close_friend(auth.uid(), p.user_id)
            WHEN 'all_friends'::text THEN is_direct_friend(auth.uid(), p.user_id)
            WHEN 'mutual_friends'::text THEN is_mutual_friend(auth.uid(), p.user_id)
            ELSE false
        END OR (p.is_demo = true))))));
CREATE POLICY "Posts viewable based on visibility" ON public."posts" AS PERMISSIVE FOR SELECT TO "public" USING (((user_id = auth.uid()) OR (is_demo = true) OR is_direct_friend(auth.uid(), user_id)));
CREATE POLICY "Users can create own posts" ON public."posts" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own posts" ON public."posts" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Demo profiles are readable by authenticated users" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_demo_user(id));
CREATE POLICY "Users can insert own profile" ON public."profiles" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can read own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = id));
CREATE POLICY "Users can update own profile" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = id));
CREATE POLICY "Admins can view all promotion interest" ON public."promotion_interest" AS PERMISSIVE FOR SELECT TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own promotion interest" ON public."promotion_interest" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Venue owners can insert promotion interest" ON public."promotion_interest" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() = user_id) AND is_venue_owner(auth.uid(), venue_id)));
CREATE POLICY "Allow all inserts" ON public."push_logs" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (true);
CREATE POLICY "Authenticated can read" ON public."push_logs" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Users can view own throttle records" ON public."push_throttle" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own rate limit actions" ON public."rate_limit_actions" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read own rate limit actions" ON public."rate_limit_actions" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can create reports" ON public."reports" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = reporter_id));
CREATE POLICY "Users can view own reports" ON public."reports" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = reporter_id));
CREATE POLICY "Anyone can view review votes" ON public."review_votes" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Authenticated users can create votes" ON public."review_votes" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can delete own votes" ON public."review_votes" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own votes" ON public."review_votes" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Public buzz stories viewable by authenticated users" ON public."stories" AS PERMISSIVE FOR SELECT TO "public" USING (((is_public_buzz = true) AND (auth.uid() IS NOT NULL)));
CREATE POLICY "Stories viewable by friends based on visibility" ON public."stories" AS PERMISSIVE FOR SELECT TO "public" USING (((user_id = auth.uid()) OR (is_demo = true) OR (is_public_buzz = true) OR
CASE visibility
    WHEN 'close_friends'::text THEN is_close_friend(auth.uid(), user_id)
    WHEN 'all_friends'::text THEN is_direct_friend(auth.uid(), user_id)
    WHEN 'mutual_friends'::text THEN is_friend_or_mutual(auth.uid(), user_id)
    ELSE false
END));
CREATE POLICY "Users can create own stories" ON public."stories" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own stories" ON public."stories" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can create story views" ON public."story_views" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view story views" ON public."story_views" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM stories
  WHERE ((stories.id = story_views.story_id) AND (stories.user_id = auth.uid()))))));
CREATE POLICY "Admins can delete roles" ON public."user_roles" AS PERMISSIVE FOR DELETE TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert roles" ON public."user_roles" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view roles" ON public."user_roles" AS PERMISSIVE FOR SELECT TO "public" USING ((has_role(auth.uid(), 'admin'::app_role) OR (user_id = auth.uid())));
CREATE POLICY "Admins can update auto corrections" ON public."venue_auto_corrections" AS PERMISSIVE FOR UPDATE TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view auto corrections" ON public."venue_auto_corrections" AS PERMISSIVE FOR SELECT TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view buzz messages" ON public."venue_buzz_messages" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Users can create own buzz messages" ON public."venue_buzz_messages" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can delete own buzz messages" ON public."venue_buzz_messages" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Admins can update claim requests" ON public."venue_claim_requests" AS PERMISSIVE FOR UPDATE TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all claim requests" ON public."venue_claim_requests" AS PERMISSIVE FOR SELECT TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create own claim requests" ON public."venue_claim_requests" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own claim requests" ON public."venue_claim_requests" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Authenticated users read editorial recommendations" ON public."venue_editorial_recommendations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (active);
CREATE POLICY "Authenticated users can view venue leaderboard scores" ON public."venue_leaderboard_scores" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Admins can update reports" ON public."venue_location_reports" AS PERMISSIVE FOR UPDATE TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all reports" ON public."venue_location_reports" AS PERMISSIVE FOR SELECT TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create their own reports" ON public."venue_location_reports" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view their own reports" ON public."venue_location_reports" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Authenticated users can insert throttle records" ON public."venue_notif_throttle" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read own throttle rows" ON public."venue_notif_throttle" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Admins can delete venue owners" ON public."venue_owners" AS PERMISSIVE FOR DELETE TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert venue owners" ON public."venue_owners" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update venue owners" ON public."venue_owners" AS PERMISSIVE FOR UPDATE TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view venue owners" ON public."venue_owners" AS PERMISSIVE FOR SELECT TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own venue ownerships" ON public."venue_owners" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Admins can manage promotions" ON public."venue_promotions" AS PERMISSIVE FOR ALL TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all promotions" ON public."venue_promotions" AS PERMISSIVE FOR SELECT TO "public" USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Venue owners can create promotions" ON public."venue_promotions" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((is_venue_owner(auth.uid(), venue_id) AND (auth.uid() = created_by)));
CREATE POLICY "Venue owners can view their promotions" ON public."venue_promotions" AS PERMISSIVE FOR SELECT TO "public" USING (is_venue_owner(auth.uid(), venue_id));
CREATE POLICY "Anyone can view reviews" ON public."venue_reviews" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Authenticated users can create reviews" ON public."venue_reviews" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can delete own reviews" ON public."venue_reviews" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own reviews" ON public."venue_reviews" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Anyone can view pinned venue yap messages" ON public."venue_yap_messages" AS PERMISSIVE FOR SELECT TO "public" USING (((is_pinned = true) AND ((expires_at IS NULL) OR (expires_at > now()))));
CREATE POLICY "Authenticated users can view non-pinned venue yap messages" ON public."venue_yap_messages" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() IS NOT NULL) AND (is_pinned = false) AND ((expires_at IS NULL) OR (expires_at > now()))));
CREATE POLICY "Venue owners can create yap messages" ON public."venue_yap_messages" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((is_venue_owner(auth.uid(), venue_id) AND (auth.uid() = posted_by)));
CREATE POLICY "Venue owners can delete their venue yap messages" ON public."venue_yap_messages" AS PERMISSIVE FOR DELETE TO "public" USING (is_venue_owner(auth.uid(), venue_id));
CREATE POLICY "Venue owners can update their venue yap messages" ON public."venue_yap_messages" AS PERMISSIVE FOR UPDATE TO "public" USING (is_venue_owner(auth.uid(), venue_id));
CREATE POLICY "Admins can insert venues" ON public."venues" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update venues" ON public."venues" AS PERMISSIVE FOR UPDATE TO "public" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Venues are viewable by everyone" ON public."venues" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Users can add to own wishlist" ON public."wishlist_places" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete from own wishlist" ON public."wishlist_places" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own wishlist" ON public."wishlist_places" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can create their own comment votes" ON public."yap_comment_votes" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own comment votes" ON public."yap_comment_votes" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own comment votes" ON public."yap_comment_votes" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can view all comment votes" ON public."yap_comment_votes" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Users can create comments" ON public."yap_comments" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own comments" ON public."yap_comments" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Yap comments viewable by everyone" ON public."yap_comments" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Users can create yap messages" ON public."yap_messages" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own yap messages" ON public."yap_messages" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Yap messages viewable with privacy" ON public."yap_messages" AS PERMISSIVE FOR SELECT TO "public" USING (((is_private_party = false) OR (auth.uid() = user_id) OR ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM night_statuses ns
  WHERE ((ns.user_id = auth.uid()) AND (ns.status = 'out'::night_status_enum) AND (ns.lat IS NOT NULL) AND (ns.lng IS NOT NULL) AND (yap_messages.party_lat IS NOT NULL) AND (yap_messages.party_lng IS NOT NULL) AND (((6371000)::double precision * acos(LEAST((1.0)::double precision, GREATEST(('-1.0'::numeric)::double precision, (((cos(radians(ns.lat)) * cos(radians(yap_messages.party_lat))) * cos((radians(yap_messages.party_lng) - radians(ns.lng)))) + (sin(radians(ns.lat)) * sin(radians(yap_messages.party_lat)))))))) <= (200)::double precision)))))));
CREATE POLICY "Users can create their own votes" ON public."yap_votes" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own votes" ON public."yap_votes" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own votes" ON public."yap_votes" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Yap votes viewable by everyone" ON public."yap_votes" AS PERMISSIVE FOR SELECT TO "public" USING (true);
GRANT INSERT ON public."party_locations" TO "anon";
GRANT SELECT ON public."party_locations" TO "anon";
GRANT UPDATE ON public."party_locations" TO "anon";
GRANT DELETE ON public."party_locations" TO "anon";
GRANT TRUNCATE ON public."party_locations" TO "anon";
GRANT REFERENCES ON public."party_locations" TO "anon";
GRANT TRIGGER ON public."party_locations" TO "anon";
GRANT INSERT ON public."party_locations" TO "authenticated";
GRANT SELECT ON public."party_locations" TO "authenticated";
GRANT UPDATE ON public."party_locations" TO "authenticated";
GRANT DELETE ON public."party_locations" TO "authenticated";
GRANT TRUNCATE ON public."party_locations" TO "authenticated";
GRANT REFERENCES ON public."party_locations" TO "authenticated";
GRANT TRIGGER ON public."party_locations" TO "authenticated";
GRANT INSERT ON public."party_locations" TO "service_role";
GRANT SELECT ON public."party_locations" TO "service_role";
GRANT UPDATE ON public."party_locations" TO "service_role";
GRANT DELETE ON public."party_locations" TO "service_role";
GRANT TRUNCATE ON public."party_locations" TO "service_role";
GRANT REFERENCES ON public."party_locations" TO "service_role";
GRANT TRIGGER ON public."party_locations" TO "service_role";
GRANT INSERT ON public."venue_editorial_recommendations" TO "anon";
GRANT SELECT ON public."venue_editorial_recommendations" TO "anon";
GRANT UPDATE ON public."venue_editorial_recommendations" TO "anon";
GRANT DELETE ON public."venue_editorial_recommendations" TO "anon";
GRANT TRUNCATE ON public."venue_editorial_recommendations" TO "anon";
GRANT REFERENCES ON public."venue_editorial_recommendations" TO "anon";
GRANT TRIGGER ON public."venue_editorial_recommendations" TO "anon";
GRANT INSERT ON public."venue_editorial_recommendations" TO "authenticated";
GRANT SELECT ON public."venue_editorial_recommendations" TO "authenticated";
GRANT UPDATE ON public."venue_editorial_recommendations" TO "authenticated";
GRANT DELETE ON public."venue_editorial_recommendations" TO "authenticated";
GRANT TRUNCATE ON public."venue_editorial_recommendations" TO "authenticated";
GRANT REFERENCES ON public."venue_editorial_recommendations" TO "authenticated";
GRANT TRIGGER ON public."venue_editorial_recommendations" TO "authenticated";
GRANT INSERT ON public."venue_editorial_recommendations" TO "service_role";
GRANT SELECT ON public."venue_editorial_recommendations" TO "service_role";
GRANT UPDATE ON public."venue_editorial_recommendations" TO "service_role";
GRANT DELETE ON public."venue_editorial_recommendations" TO "service_role";
GRANT TRUNCATE ON public."venue_editorial_recommendations" TO "service_role";
GRANT REFERENCES ON public."venue_editorial_recommendations" TO "service_role";
GRANT TRIGGER ON public."venue_editorial_recommendations" TO "service_role";
GRANT INSERT ON public."leaderboard_neighborhoods" TO "anon";
GRANT SELECT ON public."leaderboard_neighborhoods" TO "anon";
GRANT UPDATE ON public."leaderboard_neighborhoods" TO "anon";
GRANT DELETE ON public."leaderboard_neighborhoods" TO "anon";
GRANT TRUNCATE ON public."leaderboard_neighborhoods" TO "anon";
GRANT REFERENCES ON public."leaderboard_neighborhoods" TO "anon";
GRANT TRIGGER ON public."leaderboard_neighborhoods" TO "anon";
GRANT INSERT ON public."leaderboard_neighborhoods" TO "authenticated";
GRANT SELECT ON public."leaderboard_neighborhoods" TO "authenticated";
GRANT UPDATE ON public."leaderboard_neighborhoods" TO "authenticated";
GRANT DELETE ON public."leaderboard_neighborhoods" TO "authenticated";
GRANT TRUNCATE ON public."leaderboard_neighborhoods" TO "authenticated";
GRANT REFERENCES ON public."leaderboard_neighborhoods" TO "authenticated";
GRANT TRIGGER ON public."leaderboard_neighborhoods" TO "authenticated";
GRANT INSERT ON public."leaderboard_neighborhoods" TO "service_role";
GRANT SELECT ON public."leaderboard_neighborhoods" TO "service_role";
GRANT UPDATE ON public."leaderboard_neighborhoods" TO "service_role";
GRANT DELETE ON public."leaderboard_neighborhoods" TO "service_role";
GRANT TRUNCATE ON public."leaderboard_neighborhoods" TO "service_role";
GRANT REFERENCES ON public."leaderboard_neighborhoods" TO "service_role";
GRANT TRIGGER ON public."leaderboard_neighborhoods" TO "service_role";
GRANT INSERT ON public."post_tags" TO "anon";
GRANT SELECT ON public."post_tags" TO "anon";
GRANT UPDATE ON public."post_tags" TO "anon";
GRANT DELETE ON public."post_tags" TO "anon";
GRANT TRUNCATE ON public."post_tags" TO "anon";
GRANT REFERENCES ON public."post_tags" TO "anon";
GRANT TRIGGER ON public."post_tags" TO "anon";
GRANT INSERT ON public."post_tags" TO "authenticated";
GRANT SELECT ON public."post_tags" TO "authenticated";
GRANT UPDATE ON public."post_tags" TO "authenticated";
GRANT DELETE ON public."post_tags" TO "authenticated";
GRANT TRUNCATE ON public."post_tags" TO "authenticated";
GRANT REFERENCES ON public."post_tags" TO "authenticated";
GRANT TRIGGER ON public."post_tags" TO "authenticated";
GRANT INSERT ON public."post_tags" TO "service_role";
GRANT SELECT ON public."post_tags" TO "service_role";
GRANT UPDATE ON public."post_tags" TO "service_role";
GRANT DELETE ON public."post_tags" TO "service_role";
GRANT TRUNCATE ON public."post_tags" TO "service_role";
GRANT REFERENCES ON public."post_tags" TO "service_role";
GRANT TRIGGER ON public."post_tags" TO "service_role";
GRANT INSERT ON public."posts" TO "anon";
GRANT SELECT ON public."posts" TO "anon";
GRANT UPDATE ON public."posts" TO "anon";
GRANT DELETE ON public."posts" TO "anon";
GRANT TRUNCATE ON public."posts" TO "anon";
GRANT REFERENCES ON public."posts" TO "anon";
GRANT TRIGGER ON public."posts" TO "anon";
GRANT INSERT ON public."posts" TO "authenticated";
GRANT SELECT ON public."posts" TO "authenticated";
GRANT UPDATE ON public."posts" TO "authenticated";
GRANT DELETE ON public."posts" TO "authenticated";
GRANT TRUNCATE ON public."posts" TO "authenticated";
GRANT REFERENCES ON public."posts" TO "authenticated";
GRANT TRIGGER ON public."posts" TO "authenticated";
GRANT INSERT ON public."posts" TO "service_role";
GRANT SELECT ON public."posts" TO "service_role";
GRANT UPDATE ON public."posts" TO "service_role";
GRANT DELETE ON public."posts" TO "service_role";
GRANT TRUNCATE ON public."posts" TO "service_role";
GRANT REFERENCES ON public."posts" TO "service_role";
GRANT TRIGGER ON public."posts" TO "service_role";
GRANT INSERT ON public."venue_leaderboard_scores" TO "anon";
GRANT SELECT ON public."venue_leaderboard_scores" TO "anon";
GRANT UPDATE ON public."venue_leaderboard_scores" TO "anon";
GRANT DELETE ON public."venue_leaderboard_scores" TO "anon";
GRANT TRUNCATE ON public."venue_leaderboard_scores" TO "anon";
GRANT REFERENCES ON public."venue_leaderboard_scores" TO "anon";
GRANT TRIGGER ON public."venue_leaderboard_scores" TO "anon";
GRANT INSERT ON public."venue_leaderboard_scores" TO "authenticated";
GRANT SELECT ON public."venue_leaderboard_scores" TO "authenticated";
GRANT UPDATE ON public."venue_leaderboard_scores" TO "authenticated";
GRANT DELETE ON public."venue_leaderboard_scores" TO "authenticated";
GRANT TRUNCATE ON public."venue_leaderboard_scores" TO "authenticated";
GRANT REFERENCES ON public."venue_leaderboard_scores" TO "authenticated";
GRANT TRIGGER ON public."venue_leaderboard_scores" TO "authenticated";
GRANT INSERT ON public."venue_leaderboard_scores" TO "service_role";
GRANT SELECT ON public."venue_leaderboard_scores" TO "service_role";
GRANT UPDATE ON public."venue_leaderboard_scores" TO "service_role";
GRANT DELETE ON public."venue_leaderboard_scores" TO "service_role";
GRANT TRUNCATE ON public."venue_leaderboard_scores" TO "service_role";
GRANT REFERENCES ON public."venue_leaderboard_scores" TO "service_role";
GRANT TRIGGER ON public."venue_leaderboard_scores" TO "service_role";
GRANT INSERT ON public."venue_signal_events" TO "service_role";
GRANT SELECT ON public."venue_signal_events" TO "service_role";
GRANT UPDATE ON public."venue_signal_events" TO "service_role";
GRANT DELETE ON public."venue_signal_events" TO "service_role";
GRANT TRUNCATE ON public."venue_signal_events" TO "service_role";
GRANT REFERENCES ON public."venue_signal_events" TO "service_role";
GRANT TRIGGER ON public."venue_signal_events" TO "service_role";
GRANT INSERT ON public."live_location_state" TO "service_role";
GRANT SELECT ON public."live_location_state" TO "service_role";
GRANT UPDATE ON public."live_location_state" TO "service_role";
GRANT DELETE ON public."live_location_state" TO "service_role";
GRANT TRUNCATE ON public."live_location_state" TO "service_role";
GRANT REFERENCES ON public."live_location_state" TO "service_role";
GRANT TRIGGER ON public."live_location_state" TO "service_role";
GRANT INSERT ON public."live_location_state" TO "authenticated";
GRANT SELECT ON public."live_location_state" TO "authenticated";
GRANT UPDATE ON public."live_location_state" TO "authenticated";
GRANT DELETE ON public."live_location_state" TO "authenticated";
GRANT INSERT ON public."blocked_users" TO "anon";
GRANT SELECT ON public."blocked_users" TO "anon";
GRANT UPDATE ON public."blocked_users" TO "anon";
GRANT DELETE ON public."blocked_users" TO "anon";
GRANT TRUNCATE ON public."blocked_users" TO "anon";
GRANT REFERENCES ON public."blocked_users" TO "anon";
GRANT TRIGGER ON public."blocked_users" TO "anon";
GRANT INSERT ON public."blocked_users" TO "authenticated";
GRANT SELECT ON public."blocked_users" TO "authenticated";
GRANT UPDATE ON public."blocked_users" TO "authenticated";
GRANT DELETE ON public."blocked_users" TO "authenticated";
GRANT TRUNCATE ON public."blocked_users" TO "authenticated";
GRANT REFERENCES ON public."blocked_users" TO "authenticated";
GRANT TRIGGER ON public."blocked_users" TO "authenticated";
GRANT INSERT ON public."blocked_users" TO "service_role";
GRANT SELECT ON public."blocked_users" TO "service_role";
GRANT UPDATE ON public."blocked_users" TO "service_role";
GRANT DELETE ON public."blocked_users" TO "service_role";
GRANT TRUNCATE ON public."blocked_users" TO "service_role";
GRANT REFERENCES ON public."blocked_users" TO "service_role";
GRANT TRIGGER ON public."blocked_users" TO "service_role";
GRANT INSERT ON public."dm_messages" TO "anon";
GRANT SELECT ON public."dm_messages" TO "anon";
GRANT UPDATE ON public."dm_messages" TO "anon";
GRANT DELETE ON public."dm_messages" TO "anon";
GRANT TRUNCATE ON public."dm_messages" TO "anon";
GRANT REFERENCES ON public."dm_messages" TO "anon";
GRANT TRIGGER ON public."dm_messages" TO "anon";
GRANT INSERT ON public."dm_messages" TO "authenticated";
GRANT SELECT ON public."dm_messages" TO "authenticated";
GRANT UPDATE ON public."dm_messages" TO "authenticated";
GRANT DELETE ON public."dm_messages" TO "authenticated";
GRANT TRUNCATE ON public."dm_messages" TO "authenticated";
GRANT REFERENCES ON public."dm_messages" TO "authenticated";
GRANT TRIGGER ON public."dm_messages" TO "authenticated";
GRANT INSERT ON public."dm_messages" TO "service_role";
GRANT SELECT ON public."dm_messages" TO "service_role";
GRANT UPDATE ON public."dm_messages" TO "service_role";
GRANT DELETE ON public."dm_messages" TO "service_role";
GRANT TRUNCATE ON public."dm_messages" TO "service_role";
GRANT REFERENCES ON public."dm_messages" TO "service_role";
GRANT TRIGGER ON public."dm_messages" TO "service_role";
GRANT INSERT ON public."dm_read_receipts" TO "anon";
GRANT SELECT ON public."dm_read_receipts" TO "anon";
GRANT UPDATE ON public."dm_read_receipts" TO "anon";
GRANT DELETE ON public."dm_read_receipts" TO "anon";
GRANT TRUNCATE ON public."dm_read_receipts" TO "anon";
GRANT REFERENCES ON public."dm_read_receipts" TO "anon";
GRANT TRIGGER ON public."dm_read_receipts" TO "anon";
GRANT INSERT ON public."dm_read_receipts" TO "authenticated";
GRANT SELECT ON public."dm_read_receipts" TO "authenticated";
GRANT UPDATE ON public."dm_read_receipts" TO "authenticated";
GRANT DELETE ON public."dm_read_receipts" TO "authenticated";
GRANT TRUNCATE ON public."dm_read_receipts" TO "authenticated";
GRANT REFERENCES ON public."dm_read_receipts" TO "authenticated";
GRANT TRIGGER ON public."dm_read_receipts" TO "authenticated";
GRANT INSERT ON public."dm_read_receipts" TO "service_role";
GRANT SELECT ON public."dm_read_receipts" TO "service_role";
GRANT UPDATE ON public."dm_read_receipts" TO "service_role";
GRANT DELETE ON public."dm_read_receipts" TO "service_role";
GRANT TRUNCATE ON public."dm_read_receipts" TO "service_role";
GRANT REFERENCES ON public."dm_read_receipts" TO "service_role";
GRANT TRIGGER ON public."dm_read_receipts" TO "service_role";
GRANT INSERT ON public."daily_nudges" TO "anon";
GRANT SELECT ON public."daily_nudges" TO "anon";
GRANT UPDATE ON public."daily_nudges" TO "anon";
GRANT DELETE ON public."daily_nudges" TO "anon";
GRANT TRUNCATE ON public."daily_nudges" TO "anon";
GRANT REFERENCES ON public."daily_nudges" TO "anon";
GRANT TRIGGER ON public."daily_nudges" TO "anon";
GRANT INSERT ON public."daily_nudges" TO "authenticated";
GRANT SELECT ON public."daily_nudges" TO "authenticated";
GRANT UPDATE ON public."daily_nudges" TO "authenticated";
GRANT DELETE ON public."daily_nudges" TO "authenticated";
GRANT TRUNCATE ON public."daily_nudges" TO "authenticated";
GRANT REFERENCES ON public."daily_nudges" TO "authenticated";
GRANT TRIGGER ON public."daily_nudges" TO "authenticated";
GRANT INSERT ON public."daily_nudges" TO "service_role";
GRANT SELECT ON public."daily_nudges" TO "service_role";
GRANT UPDATE ON public."daily_nudges" TO "service_role";
GRANT DELETE ON public."daily_nudges" TO "service_role";
GRANT TRUNCATE ON public."daily_nudges" TO "service_role";
GRANT REFERENCES ON public."daily_nudges" TO "service_role";
GRANT TRIGGER ON public."daily_nudges" TO "service_role";
GRANT INSERT ON public."dm_message_reactions" TO "anon";
GRANT SELECT ON public."dm_message_reactions" TO "anon";
GRANT UPDATE ON public."dm_message_reactions" TO "anon";
GRANT DELETE ON public."dm_message_reactions" TO "anon";
GRANT TRUNCATE ON public."dm_message_reactions" TO "anon";
GRANT REFERENCES ON public."dm_message_reactions" TO "anon";
GRANT TRIGGER ON public."dm_message_reactions" TO "anon";
GRANT INSERT ON public."dm_message_reactions" TO "authenticated";
GRANT SELECT ON public."dm_message_reactions" TO "authenticated";
GRANT UPDATE ON public."dm_message_reactions" TO "authenticated";
GRANT DELETE ON public."dm_message_reactions" TO "authenticated";
GRANT TRUNCATE ON public."dm_message_reactions" TO "authenticated";
GRANT REFERENCES ON public."dm_message_reactions" TO "authenticated";
GRANT TRIGGER ON public."dm_message_reactions" TO "authenticated";
GRANT INSERT ON public."dm_message_reactions" TO "service_role";
GRANT SELECT ON public."dm_message_reactions" TO "service_role";
GRANT UPDATE ON public."dm_message_reactions" TO "service_role";
GRANT DELETE ON public."dm_message_reactions" TO "service_role";
GRANT TRUNCATE ON public."dm_message_reactions" TO "service_role";
GRANT REFERENCES ON public."dm_message_reactions" TO "service_role";
GRANT TRIGGER ON public."dm_message_reactions" TO "service_role";
GRANT INSERT ON public."dm_thread_members" TO "anon";
GRANT SELECT ON public."dm_thread_members" TO "anon";
GRANT UPDATE ON public."dm_thread_members" TO "anon";
GRANT DELETE ON public."dm_thread_members" TO "anon";
GRANT TRUNCATE ON public."dm_thread_members" TO "anon";
GRANT REFERENCES ON public."dm_thread_members" TO "anon";
GRANT TRIGGER ON public."dm_thread_members" TO "anon";
GRANT INSERT ON public."dm_thread_members" TO "authenticated";
GRANT SELECT ON public."dm_thread_members" TO "authenticated";
GRANT UPDATE ON public."dm_thread_members" TO "authenticated";
GRANT DELETE ON public."dm_thread_members" TO "authenticated";
GRANT TRUNCATE ON public."dm_thread_members" TO "authenticated";
GRANT REFERENCES ON public."dm_thread_members" TO "authenticated";
GRANT TRIGGER ON public."dm_thread_members" TO "authenticated";
GRANT INSERT ON public."dm_thread_members" TO "service_role";
GRANT SELECT ON public."dm_thread_members" TO "service_role";
GRANT UPDATE ON public."dm_thread_members" TO "service_role";
GRANT DELETE ON public."dm_thread_members" TO "service_role";
GRANT TRUNCATE ON public."dm_thread_members" TO "service_role";
GRANT REFERENCES ON public."dm_thread_members" TO "service_role";
GRANT TRIGGER ON public."dm_thread_members" TO "service_role";
GRANT INSERT ON public."dm_threads" TO "anon";
GRANT SELECT ON public."dm_threads" TO "anon";
GRANT UPDATE ON public."dm_threads" TO "anon";
GRANT DELETE ON public."dm_threads" TO "anon";
GRANT TRUNCATE ON public."dm_threads" TO "anon";
GRANT REFERENCES ON public."dm_threads" TO "anon";
GRANT TRIGGER ON public."dm_threads" TO "anon";
GRANT INSERT ON public."dm_threads" TO "authenticated";
GRANT SELECT ON public."dm_threads" TO "authenticated";
GRANT UPDATE ON public."dm_threads" TO "authenticated";
GRANT DELETE ON public."dm_threads" TO "authenticated";
GRANT TRUNCATE ON public."dm_threads" TO "authenticated";
GRANT REFERENCES ON public."dm_threads" TO "authenticated";
GRANT TRIGGER ON public."dm_threads" TO "authenticated";
GRANT INSERT ON public."dm_threads" TO "service_role";
GRANT SELECT ON public."dm_threads" TO "service_role";
GRANT UPDATE ON public."dm_threads" TO "service_role";
GRANT DELETE ON public."dm_threads" TO "service_role";
GRANT TRUNCATE ON public."dm_threads" TO "service_role";
GRANT REFERENCES ON public."dm_threads" TO "service_role";
GRANT TRIGGER ON public."dm_threads" TO "service_role";
GRANT INSERT ON public."event_logs" TO "anon";
GRANT SELECT ON public."event_logs" TO "anon";
GRANT UPDATE ON public."event_logs" TO "anon";
GRANT DELETE ON public."event_logs" TO "anon";
GRANT TRUNCATE ON public."event_logs" TO "anon";
GRANT REFERENCES ON public."event_logs" TO "anon";
GRANT TRIGGER ON public."event_logs" TO "anon";
GRANT INSERT ON public."event_logs" TO "authenticated";
GRANT SELECT ON public."event_logs" TO "authenticated";
GRANT UPDATE ON public."event_logs" TO "authenticated";
GRANT DELETE ON public."event_logs" TO "authenticated";
GRANT TRUNCATE ON public."event_logs" TO "authenticated";
GRANT REFERENCES ON public."event_logs" TO "authenticated";
GRANT TRIGGER ON public."event_logs" TO "authenticated";
GRANT INSERT ON public."event_logs" TO "service_role";
GRANT SELECT ON public."event_logs" TO "service_role";
GRANT UPDATE ON public."event_logs" TO "service_role";
GRANT DELETE ON public."event_logs" TO "service_role";
GRANT TRUNCATE ON public."event_logs" TO "service_role";
GRANT REFERENCES ON public."event_logs" TO "service_role";
GRANT TRIGGER ON public."event_logs" TO "service_role";
GRANT INSERT ON public."event_rsvps" TO "anon";
GRANT SELECT ON public."event_rsvps" TO "anon";
GRANT UPDATE ON public."event_rsvps" TO "anon";
GRANT DELETE ON public."event_rsvps" TO "anon";
GRANT TRUNCATE ON public."event_rsvps" TO "anon";
GRANT REFERENCES ON public."event_rsvps" TO "anon";
GRANT TRIGGER ON public."event_rsvps" TO "anon";
GRANT INSERT ON public."event_rsvps" TO "authenticated";
GRANT SELECT ON public."event_rsvps" TO "authenticated";
GRANT UPDATE ON public."event_rsvps" TO "authenticated";
GRANT DELETE ON public."event_rsvps" TO "authenticated";
GRANT TRUNCATE ON public."event_rsvps" TO "authenticated";
GRANT REFERENCES ON public."event_rsvps" TO "authenticated";
GRANT TRIGGER ON public."event_rsvps" TO "authenticated";
GRANT INSERT ON public."event_rsvps" TO "service_role";
GRANT SELECT ON public."event_rsvps" TO "service_role";
GRANT UPDATE ON public."event_rsvps" TO "service_role";
GRANT DELETE ON public."event_rsvps" TO "service_role";
GRANT TRUNCATE ON public."event_rsvps" TO "service_role";
GRANT REFERENCES ON public."event_rsvps" TO "service_role";
GRANT TRIGGER ON public."event_rsvps" TO "service_role";
GRANT INSERT ON public."events" TO "anon";
GRANT SELECT ON public."events" TO "anon";
GRANT UPDATE ON public."events" TO "anon";
GRANT DELETE ON public."events" TO "anon";
GRANT TRUNCATE ON public."events" TO "anon";
GRANT REFERENCES ON public."events" TO "anon";
GRANT TRIGGER ON public."events" TO "anon";
GRANT INSERT ON public."events" TO "authenticated";
GRANT SELECT ON public."events" TO "authenticated";
GRANT UPDATE ON public."events" TO "authenticated";
GRANT DELETE ON public."events" TO "authenticated";
GRANT TRUNCATE ON public."events" TO "authenticated";
GRANT REFERENCES ON public."events" TO "authenticated";
GRANT TRIGGER ON public."events" TO "authenticated";
GRANT INSERT ON public."events" TO "service_role";
GRANT SELECT ON public."events" TO "service_role";
GRANT UPDATE ON public."events" TO "service_role";
GRANT DELETE ON public."events" TO "service_role";
GRANT TRUNCATE ON public."events" TO "service_role";
GRANT REFERENCES ON public."events" TO "service_role";
GRANT TRIGGER ON public."events" TO "service_role";
GRANT INSERT ON public."friendships" TO "anon";
GRANT SELECT ON public."friendships" TO "anon";
GRANT UPDATE ON public."friendships" TO "anon";
GRANT DELETE ON public."friendships" TO "anon";
GRANT TRUNCATE ON public."friendships" TO "anon";
GRANT REFERENCES ON public."friendships" TO "anon";
GRANT TRIGGER ON public."friendships" TO "anon";
GRANT INSERT ON public."friendships" TO "authenticated";
GRANT SELECT ON public."friendships" TO "authenticated";
GRANT UPDATE ON public."friendships" TO "authenticated";
GRANT DELETE ON public."friendships" TO "authenticated";
GRANT TRUNCATE ON public."friendships" TO "authenticated";
GRANT REFERENCES ON public."friendships" TO "authenticated";
GRANT TRIGGER ON public."friendships" TO "authenticated";
GRANT INSERT ON public."friendships" TO "service_role";
GRANT SELECT ON public."friendships" TO "service_role";
GRANT UPDATE ON public."friendships" TO "service_role";
GRANT DELETE ON public."friendships" TO "service_role";
GRANT TRUNCATE ON public."friendships" TO "service_role";
GRANT REFERENCES ON public."friendships" TO "service_role";
GRANT TRIGGER ON public."friendships" TO "service_role";
GRANT INSERT ON public."invite_codes" TO "anon";
GRANT SELECT ON public."invite_codes" TO "anon";
GRANT UPDATE ON public."invite_codes" TO "anon";
GRANT DELETE ON public."invite_codes" TO "anon";
GRANT TRUNCATE ON public."invite_codes" TO "anon";
GRANT REFERENCES ON public."invite_codes" TO "anon";
GRANT TRIGGER ON public."invite_codes" TO "anon";
GRANT INSERT ON public."invite_codes" TO "authenticated";
GRANT SELECT ON public."invite_codes" TO "authenticated";
GRANT UPDATE ON public."invite_codes" TO "authenticated";
GRANT DELETE ON public."invite_codes" TO "authenticated";
GRANT TRUNCATE ON public."invite_codes" TO "authenticated";
GRANT REFERENCES ON public."invite_codes" TO "authenticated";
GRANT TRIGGER ON public."invite_codes" TO "authenticated";
GRANT INSERT ON public."invite_codes" TO "service_role";
GRANT SELECT ON public."invite_codes" TO "service_role";
GRANT UPDATE ON public."invite_codes" TO "service_role";
GRANT DELETE ON public."invite_codes" TO "service_role";
GRANT TRUNCATE ON public."invite_codes" TO "service_role";
GRANT REFERENCES ON public."invite_codes" TO "service_role";
GRANT TRIGGER ON public."invite_codes" TO "service_role";
GRANT INSERT ON public."invite_uses" TO "anon";
GRANT SELECT ON public."invite_uses" TO "anon";
GRANT UPDATE ON public."invite_uses" TO "anon";
GRANT DELETE ON public."invite_uses" TO "anon";
GRANT TRUNCATE ON public."invite_uses" TO "anon";
GRANT REFERENCES ON public."invite_uses" TO "anon";
GRANT TRIGGER ON public."invite_uses" TO "anon";
GRANT INSERT ON public."invite_uses" TO "authenticated";
GRANT SELECT ON public."invite_uses" TO "authenticated";
GRANT UPDATE ON public."invite_uses" TO "authenticated";
GRANT DELETE ON public."invite_uses" TO "authenticated";
GRANT TRUNCATE ON public."invite_uses" TO "authenticated";
GRANT REFERENCES ON public."invite_uses" TO "authenticated";
GRANT TRIGGER ON public."invite_uses" TO "authenticated";
GRANT INSERT ON public."invite_uses" TO "service_role";
GRANT SELECT ON public."invite_uses" TO "service_role";
GRANT UPDATE ON public."invite_uses" TO "service_role";
GRANT DELETE ON public."invite_uses" TO "service_role";
GRANT TRUNCATE ON public."invite_uses" TO "service_role";
GRANT REFERENCES ON public."invite_uses" TO "service_role";
GRANT TRIGGER ON public."invite_uses" TO "service_role";
GRANT INSERT ON public."location_detection_logs" TO "anon";
GRANT SELECT ON public."location_detection_logs" TO "anon";
GRANT UPDATE ON public."location_detection_logs" TO "anon";
GRANT DELETE ON public."location_detection_logs" TO "anon";
GRANT TRUNCATE ON public."location_detection_logs" TO "anon";
GRANT REFERENCES ON public."location_detection_logs" TO "anon";
GRANT TRIGGER ON public."location_detection_logs" TO "anon";
GRANT INSERT ON public."location_detection_logs" TO "authenticated";
GRANT SELECT ON public."location_detection_logs" TO "authenticated";
GRANT UPDATE ON public."location_detection_logs" TO "authenticated";
GRANT DELETE ON public."location_detection_logs" TO "authenticated";
GRANT TRUNCATE ON public."location_detection_logs" TO "authenticated";
GRANT REFERENCES ON public."location_detection_logs" TO "authenticated";
GRANT TRIGGER ON public."location_detection_logs" TO "authenticated";
GRANT INSERT ON public."location_detection_logs" TO "service_role";
GRANT SELECT ON public."location_detection_logs" TO "service_role";
GRANT UPDATE ON public."location_detection_logs" TO "service_role";
GRANT DELETE ON public."location_detection_logs" TO "service_role";
GRANT TRUNCATE ON public."location_detection_logs" TO "service_role";
GRANT REFERENCES ON public."location_detection_logs" TO "service_role";
GRANT TRIGGER ON public."location_detection_logs" TO "service_role";
GRANT INSERT ON public."notifications" TO "anon";
GRANT SELECT ON public."notifications" TO "anon";
GRANT UPDATE ON public."notifications" TO "anon";
GRANT DELETE ON public."notifications" TO "anon";
GRANT TRUNCATE ON public."notifications" TO "anon";
GRANT REFERENCES ON public."notifications" TO "anon";
GRANT TRIGGER ON public."notifications" TO "anon";
GRANT INSERT ON public."notifications" TO "authenticated";
GRANT SELECT ON public."notifications" TO "authenticated";
GRANT UPDATE ON public."notifications" TO "authenticated";
GRANT DELETE ON public."notifications" TO "authenticated";
GRANT TRUNCATE ON public."notifications" TO "authenticated";
GRANT REFERENCES ON public."notifications" TO "authenticated";
GRANT TRIGGER ON public."notifications" TO "authenticated";
GRANT INSERT ON public."notifications" TO "service_role";
GRANT SELECT ON public."notifications" TO "service_role";
GRANT UPDATE ON public."notifications" TO "service_role";
GRANT DELETE ON public."notifications" TO "service_role";
GRANT TRUNCATE ON public."notifications" TO "service_role";
GRANT REFERENCES ON public."notifications" TO "service_role";
GRANT TRIGGER ON public."notifications" TO "service_role";
GRANT INSERT ON public."plan_comments" TO "anon";
GRANT SELECT ON public."plan_comments" TO "anon";
GRANT UPDATE ON public."plan_comments" TO "anon";
GRANT DELETE ON public."plan_comments" TO "anon";
GRANT TRUNCATE ON public."plan_comments" TO "anon";
GRANT REFERENCES ON public."plan_comments" TO "anon";
GRANT TRIGGER ON public."plan_comments" TO "anon";
GRANT INSERT ON public."plan_comments" TO "authenticated";
GRANT SELECT ON public."plan_comments" TO "authenticated";
GRANT UPDATE ON public."plan_comments" TO "authenticated";
GRANT DELETE ON public."plan_comments" TO "authenticated";
GRANT TRUNCATE ON public."plan_comments" TO "authenticated";
GRANT REFERENCES ON public."plan_comments" TO "authenticated";
GRANT TRIGGER ON public."plan_comments" TO "authenticated";
GRANT INSERT ON public."plan_comments" TO "service_role";
GRANT SELECT ON public."plan_comments" TO "service_role";
GRANT UPDATE ON public."plan_comments" TO "service_role";
GRANT DELETE ON public."plan_comments" TO "service_role";
GRANT TRUNCATE ON public."plan_comments" TO "service_role";
GRANT REFERENCES ON public."plan_comments" TO "service_role";
GRANT TRIGGER ON public."plan_comments" TO "service_role";
GRANT INSERT ON public."plan_downs" TO "anon";
GRANT SELECT ON public."plan_downs" TO "anon";
GRANT UPDATE ON public."plan_downs" TO "anon";
GRANT DELETE ON public."plan_downs" TO "anon";
GRANT TRUNCATE ON public."plan_downs" TO "anon";
GRANT REFERENCES ON public."plan_downs" TO "anon";
GRANT TRIGGER ON public."plan_downs" TO "anon";
GRANT INSERT ON public."plan_downs" TO "authenticated";
GRANT SELECT ON public."plan_downs" TO "authenticated";
GRANT UPDATE ON public."plan_downs" TO "authenticated";
GRANT DELETE ON public."plan_downs" TO "authenticated";
GRANT TRUNCATE ON public."plan_downs" TO "authenticated";
GRANT REFERENCES ON public."plan_downs" TO "authenticated";
GRANT TRIGGER ON public."plan_downs" TO "authenticated";
GRANT INSERT ON public."plan_downs" TO "service_role";
GRANT SELECT ON public."plan_downs" TO "service_role";
GRANT UPDATE ON public."plan_downs" TO "service_role";
GRANT DELETE ON public."plan_downs" TO "service_role";
GRANT TRUNCATE ON public."plan_downs" TO "service_role";
GRANT REFERENCES ON public."plan_downs" TO "service_role";
GRANT TRIGGER ON public."plan_downs" TO "service_role";
GRANT INSERT ON public."night_statuses" TO "anon";
GRANT SELECT ON public."night_statuses" TO "anon";
GRANT UPDATE ON public."night_statuses" TO "anon";
GRANT DELETE ON public."night_statuses" TO "anon";
GRANT TRUNCATE ON public."night_statuses" TO "anon";
GRANT REFERENCES ON public."night_statuses" TO "anon";
GRANT TRIGGER ON public."night_statuses" TO "anon";
GRANT INSERT ON public."night_statuses" TO "authenticated";
GRANT SELECT ON public."night_statuses" TO "authenticated";
GRANT UPDATE ON public."night_statuses" TO "authenticated";
GRANT DELETE ON public."night_statuses" TO "authenticated";
GRANT TRUNCATE ON public."night_statuses" TO "authenticated";
GRANT REFERENCES ON public."night_statuses" TO "authenticated";
GRANT TRIGGER ON public."night_statuses" TO "authenticated";
GRANT INSERT ON public."night_statuses" TO "service_role";
GRANT SELECT ON public."night_statuses" TO "service_role";
GRANT UPDATE ON public."night_statuses" TO "service_role";
GRANT DELETE ON public."night_statuses" TO "service_role";
GRANT TRUNCATE ON public."night_statuses" TO "service_role";
GRANT REFERENCES ON public."night_statuses" TO "service_role";
GRANT TRIGGER ON public."night_statuses" TO "service_role";
GRANT INSERT ON public."close_friends" TO "authenticated";
GRANT SELECT ON public."close_friends" TO "authenticated";
GRANT UPDATE ON public."close_friends" TO "authenticated";
GRANT DELETE ON public."close_friends" TO "authenticated";
GRANT TRUNCATE ON public."close_friends" TO "authenticated";
GRANT REFERENCES ON public."close_friends" TO "authenticated";
GRANT TRIGGER ON public."close_friends" TO "authenticated";
GRANT INSERT ON public."close_friends" TO "service_role";
GRANT SELECT ON public."close_friends" TO "service_role";
GRANT UPDATE ON public."close_friends" TO "service_role";
GRANT DELETE ON public."close_friends" TO "service_role";
GRANT TRUNCATE ON public."close_friends" TO "service_role";
GRANT REFERENCES ON public."close_friends" TO "service_role";
GRANT TRIGGER ON public."close_friends" TO "service_role";
GRANT INSERT ON public."checkins" TO "anon";
GRANT SELECT ON public."checkins" TO "anon";
GRANT UPDATE ON public."checkins" TO "anon";
GRANT DELETE ON public."checkins" TO "anon";
GRANT TRUNCATE ON public."checkins" TO "anon";
GRANT REFERENCES ON public."checkins" TO "anon";
GRANT TRIGGER ON public."checkins" TO "anon";
GRANT INSERT ON public."checkins" TO "authenticated";
GRANT SELECT ON public."checkins" TO "authenticated";
GRANT UPDATE ON public."checkins" TO "authenticated";
GRANT DELETE ON public."checkins" TO "authenticated";
GRANT TRUNCATE ON public."checkins" TO "authenticated";
GRANT REFERENCES ON public."checkins" TO "authenticated";
GRANT TRIGGER ON public."checkins" TO "authenticated";
GRANT INSERT ON public."checkins" TO "service_role";
GRANT SELECT ON public."checkins" TO "service_role";
GRANT UPDATE ON public."checkins" TO "service_role";
GRANT DELETE ON public."checkins" TO "service_role";
GRANT TRUNCATE ON public."checkins" TO "service_role";
GRANT REFERENCES ON public."checkins" TO "service_role";
GRANT TRIGGER ON public."checkins" TO "service_role";
GRANT INSERT ON public."plan_participants" TO "anon";
GRANT SELECT ON public."plan_participants" TO "anon";
GRANT UPDATE ON public."plan_participants" TO "anon";
GRANT DELETE ON public."plan_participants" TO "anon";
GRANT TRUNCATE ON public."plan_participants" TO "anon";
GRANT REFERENCES ON public."plan_participants" TO "anon";
GRANT TRIGGER ON public."plan_participants" TO "anon";
GRANT INSERT ON public."plan_participants" TO "authenticated";
GRANT SELECT ON public."plan_participants" TO "authenticated";
GRANT UPDATE ON public."plan_participants" TO "authenticated";
GRANT DELETE ON public."plan_participants" TO "authenticated";
GRANT TRUNCATE ON public."plan_participants" TO "authenticated";
GRANT REFERENCES ON public."plan_participants" TO "authenticated";
GRANT TRIGGER ON public."plan_participants" TO "authenticated";
GRANT INSERT ON public."plan_participants" TO "service_role";
GRANT SELECT ON public."plan_participants" TO "service_role";
GRANT UPDATE ON public."plan_participants" TO "service_role";
GRANT DELETE ON public."plan_participants" TO "service_role";
GRANT TRUNCATE ON public."plan_participants" TO "service_role";
GRANT REFERENCES ON public."plan_participants" TO "service_role";
GRANT TRIGGER ON public."plan_participants" TO "service_role";
GRANT INSERT ON public."plan_votes" TO "anon";
GRANT SELECT ON public."plan_votes" TO "anon";
GRANT UPDATE ON public."plan_votes" TO "anon";
GRANT DELETE ON public."plan_votes" TO "anon";
GRANT TRUNCATE ON public."plan_votes" TO "anon";
GRANT REFERENCES ON public."plan_votes" TO "anon";
GRANT TRIGGER ON public."plan_votes" TO "anon";
GRANT INSERT ON public."plan_votes" TO "authenticated";
GRANT SELECT ON public."plan_votes" TO "authenticated";
GRANT UPDATE ON public."plan_votes" TO "authenticated";
GRANT DELETE ON public."plan_votes" TO "authenticated";
GRANT TRUNCATE ON public."plan_votes" TO "authenticated";
GRANT REFERENCES ON public."plan_votes" TO "authenticated";
GRANT TRIGGER ON public."plan_votes" TO "authenticated";
GRANT INSERT ON public."plan_votes" TO "service_role";
GRANT SELECT ON public."plan_votes" TO "service_role";
GRANT UPDATE ON public."plan_votes" TO "service_role";
GRANT DELETE ON public."plan_votes" TO "service_role";
GRANT TRUNCATE ON public."plan_votes" TO "service_role";
GRANT REFERENCES ON public."plan_votes" TO "service_role";
GRANT TRIGGER ON public."plan_votes" TO "service_role";
GRANT INSERT ON public."post_comment_likes" TO "anon";
GRANT SELECT ON public."post_comment_likes" TO "anon";
GRANT UPDATE ON public."post_comment_likes" TO "anon";
GRANT DELETE ON public."post_comment_likes" TO "anon";
GRANT TRUNCATE ON public."post_comment_likes" TO "anon";
GRANT REFERENCES ON public."post_comment_likes" TO "anon";
GRANT TRIGGER ON public."post_comment_likes" TO "anon";
GRANT INSERT ON public."post_comment_likes" TO "authenticated";
GRANT SELECT ON public."post_comment_likes" TO "authenticated";
GRANT UPDATE ON public."post_comment_likes" TO "authenticated";
GRANT DELETE ON public."post_comment_likes" TO "authenticated";
GRANT TRUNCATE ON public."post_comment_likes" TO "authenticated";
GRANT REFERENCES ON public."post_comment_likes" TO "authenticated";
GRANT TRIGGER ON public."post_comment_likes" TO "authenticated";
GRANT INSERT ON public."post_comment_likes" TO "service_role";
GRANT SELECT ON public."post_comment_likes" TO "service_role";
GRANT UPDATE ON public."post_comment_likes" TO "service_role";
GRANT DELETE ON public."post_comment_likes" TO "service_role";
GRANT TRUNCATE ON public."post_comment_likes" TO "service_role";
GRANT REFERENCES ON public."post_comment_likes" TO "service_role";
GRANT TRIGGER ON public."post_comment_likes" TO "service_role";
GRANT INSERT ON public."post_comments" TO "anon";
GRANT SELECT ON public."post_comments" TO "anon";
GRANT UPDATE ON public."post_comments" TO "anon";
GRANT DELETE ON public."post_comments" TO "anon";
GRANT TRUNCATE ON public."post_comments" TO "anon";
GRANT REFERENCES ON public."post_comments" TO "anon";
GRANT TRIGGER ON public."post_comments" TO "anon";
GRANT INSERT ON public."post_comments" TO "authenticated";
GRANT SELECT ON public."post_comments" TO "authenticated";
GRANT UPDATE ON public."post_comments" TO "authenticated";
GRANT DELETE ON public."post_comments" TO "authenticated";
GRANT TRUNCATE ON public."post_comments" TO "authenticated";
GRANT REFERENCES ON public."post_comments" TO "authenticated";
GRANT TRIGGER ON public."post_comments" TO "authenticated";
GRANT INSERT ON public."post_comments" TO "service_role";
GRANT SELECT ON public."post_comments" TO "service_role";
GRANT UPDATE ON public."post_comments" TO "service_role";
GRANT DELETE ON public."post_comments" TO "service_role";
GRANT TRUNCATE ON public."post_comments" TO "service_role";
GRANT REFERENCES ON public."post_comments" TO "service_role";
GRANT TRIGGER ON public."post_comments" TO "service_role";
GRANT INSERT ON public."post_likes" TO "anon";
GRANT SELECT ON public."post_likes" TO "anon";
GRANT UPDATE ON public."post_likes" TO "anon";
GRANT DELETE ON public."post_likes" TO "anon";
GRANT TRUNCATE ON public."post_likes" TO "anon";
GRANT REFERENCES ON public."post_likes" TO "anon";
GRANT TRIGGER ON public."post_likes" TO "anon";
GRANT INSERT ON public."post_likes" TO "authenticated";
GRANT SELECT ON public."post_likes" TO "authenticated";
GRANT UPDATE ON public."post_likes" TO "authenticated";
GRANT DELETE ON public."post_likes" TO "authenticated";
GRANT TRUNCATE ON public."post_likes" TO "authenticated";
GRANT REFERENCES ON public."post_likes" TO "authenticated";
GRANT TRIGGER ON public."post_likes" TO "authenticated";
GRANT INSERT ON public."post_likes" TO "service_role";
GRANT SELECT ON public."post_likes" TO "service_role";
GRANT UPDATE ON public."post_likes" TO "service_role";
GRANT DELETE ON public."post_likes" TO "service_role";
GRANT TRUNCATE ON public."post_likes" TO "service_role";
GRANT REFERENCES ON public."post_likes" TO "service_role";
GRANT TRIGGER ON public."post_likes" TO "service_role";
GRANT INSERT ON public."plans" TO "anon";
GRANT SELECT ON public."plans" TO "anon";
GRANT UPDATE ON public."plans" TO "anon";
GRANT DELETE ON public."plans" TO "anon";
GRANT TRUNCATE ON public."plans" TO "anon";
GRANT REFERENCES ON public."plans" TO "anon";
GRANT TRIGGER ON public."plans" TO "anon";
GRANT INSERT ON public."plans" TO "authenticated";
GRANT SELECT ON public."plans" TO "authenticated";
GRANT UPDATE ON public."plans" TO "authenticated";
GRANT DELETE ON public."plans" TO "authenticated";
GRANT TRUNCATE ON public."plans" TO "authenticated";
GRANT REFERENCES ON public."plans" TO "authenticated";
GRANT TRIGGER ON public."plans" TO "authenticated";
GRANT INSERT ON public."plans" TO "service_role";
GRANT SELECT ON public."plans" TO "service_role";
GRANT UPDATE ON public."plans" TO "service_role";
GRANT DELETE ON public."plans" TO "service_role";
GRANT TRUNCATE ON public."plans" TO "service_role";
GRANT REFERENCES ON public."plans" TO "service_role";
GRANT TRIGGER ON public."plans" TO "service_role";
GRANT INSERT ON public."promotion_interest" TO "anon";
GRANT SELECT ON public."promotion_interest" TO "anon";
GRANT UPDATE ON public."promotion_interest" TO "anon";
GRANT DELETE ON public."promotion_interest" TO "anon";
GRANT TRUNCATE ON public."promotion_interest" TO "anon";
GRANT REFERENCES ON public."promotion_interest" TO "anon";
GRANT TRIGGER ON public."promotion_interest" TO "anon";
GRANT INSERT ON public."promotion_interest" TO "authenticated";
GRANT SELECT ON public."promotion_interest" TO "authenticated";
GRANT UPDATE ON public."promotion_interest" TO "authenticated";
GRANT DELETE ON public."promotion_interest" TO "authenticated";
GRANT TRUNCATE ON public."promotion_interest" TO "authenticated";
GRANT REFERENCES ON public."promotion_interest" TO "authenticated";
GRANT TRIGGER ON public."promotion_interest" TO "authenticated";
GRANT INSERT ON public."promotion_interest" TO "service_role";
GRANT SELECT ON public."promotion_interest" TO "service_role";
GRANT UPDATE ON public."promotion_interest" TO "service_role";
GRANT DELETE ON public."promotion_interest" TO "service_role";
GRANT TRUNCATE ON public."promotion_interest" TO "service_role";
GRANT REFERENCES ON public."promotion_interest" TO "service_role";
GRANT TRIGGER ON public."promotion_interest" TO "service_role";
GRANT INSERT ON public."push_logs" TO "anon";
GRANT SELECT ON public."push_logs" TO "anon";
GRANT UPDATE ON public."push_logs" TO "anon";
GRANT DELETE ON public."push_logs" TO "anon";
GRANT TRUNCATE ON public."push_logs" TO "anon";
GRANT REFERENCES ON public."push_logs" TO "anon";
GRANT TRIGGER ON public."push_logs" TO "anon";
GRANT INSERT ON public."push_logs" TO "authenticated";
GRANT SELECT ON public."push_logs" TO "authenticated";
GRANT UPDATE ON public."push_logs" TO "authenticated";
GRANT DELETE ON public."push_logs" TO "authenticated";
GRANT TRUNCATE ON public."push_logs" TO "authenticated";
GRANT REFERENCES ON public."push_logs" TO "authenticated";
GRANT TRIGGER ON public."push_logs" TO "authenticated";
GRANT INSERT ON public."push_logs" TO "service_role";
GRANT SELECT ON public."push_logs" TO "service_role";
GRANT UPDATE ON public."push_logs" TO "service_role";
GRANT DELETE ON public."push_logs" TO "service_role";
GRANT TRUNCATE ON public."push_logs" TO "service_role";
GRANT REFERENCES ON public."push_logs" TO "service_role";
GRANT TRIGGER ON public."push_logs" TO "service_role";
GRANT INSERT ON public."push_throttle" TO "anon";
GRANT SELECT ON public."push_throttle" TO "anon";
GRANT UPDATE ON public."push_throttle" TO "anon";
GRANT DELETE ON public."push_throttle" TO "anon";
GRANT TRUNCATE ON public."push_throttle" TO "anon";
GRANT REFERENCES ON public."push_throttle" TO "anon";
GRANT TRIGGER ON public."push_throttle" TO "anon";
GRANT INSERT ON public."push_throttle" TO "authenticated";
GRANT SELECT ON public."push_throttle" TO "authenticated";
GRANT UPDATE ON public."push_throttle" TO "authenticated";
GRANT DELETE ON public."push_throttle" TO "authenticated";
GRANT TRUNCATE ON public."push_throttle" TO "authenticated";
GRANT REFERENCES ON public."push_throttle" TO "authenticated";
GRANT TRIGGER ON public."push_throttle" TO "authenticated";
GRANT INSERT ON public."push_throttle" TO "service_role";
GRANT SELECT ON public."push_throttle" TO "service_role";
GRANT UPDATE ON public."push_throttle" TO "service_role";
GRANT DELETE ON public."push_throttle" TO "service_role";
GRANT TRUNCATE ON public."push_throttle" TO "service_role";
GRANT REFERENCES ON public."push_throttle" TO "service_role";
GRANT TRIGGER ON public."push_throttle" TO "service_role";
GRANT INSERT ON public."rate_limit_actions" TO "anon";
GRANT SELECT ON public."rate_limit_actions" TO "anon";
GRANT UPDATE ON public."rate_limit_actions" TO "anon";
GRANT DELETE ON public."rate_limit_actions" TO "anon";
GRANT TRUNCATE ON public."rate_limit_actions" TO "anon";
GRANT REFERENCES ON public."rate_limit_actions" TO "anon";
GRANT TRIGGER ON public."rate_limit_actions" TO "anon";
GRANT INSERT ON public."rate_limit_actions" TO "authenticated";
GRANT SELECT ON public."rate_limit_actions" TO "authenticated";
GRANT UPDATE ON public."rate_limit_actions" TO "authenticated";
GRANT DELETE ON public."rate_limit_actions" TO "authenticated";
GRANT TRUNCATE ON public."rate_limit_actions" TO "authenticated";
GRANT REFERENCES ON public."rate_limit_actions" TO "authenticated";
GRANT TRIGGER ON public."rate_limit_actions" TO "authenticated";
GRANT INSERT ON public."rate_limit_actions" TO "service_role";
GRANT SELECT ON public."rate_limit_actions" TO "service_role";
GRANT UPDATE ON public."rate_limit_actions" TO "service_role";
GRANT DELETE ON public."rate_limit_actions" TO "service_role";
GRANT TRUNCATE ON public."rate_limit_actions" TO "service_role";
GRANT REFERENCES ON public."rate_limit_actions" TO "service_role";
GRANT TRIGGER ON public."rate_limit_actions" TO "service_role";
GRANT INSERT ON public."reports" TO "anon";
GRANT SELECT ON public."reports" TO "anon";
GRANT UPDATE ON public."reports" TO "anon";
GRANT DELETE ON public."reports" TO "anon";
GRANT TRUNCATE ON public."reports" TO "anon";
GRANT REFERENCES ON public."reports" TO "anon";
GRANT TRIGGER ON public."reports" TO "anon";
GRANT INSERT ON public."reports" TO "authenticated";
GRANT SELECT ON public."reports" TO "authenticated";
GRANT UPDATE ON public."reports" TO "authenticated";
GRANT DELETE ON public."reports" TO "authenticated";
GRANT TRUNCATE ON public."reports" TO "authenticated";
GRANT REFERENCES ON public."reports" TO "authenticated";
GRANT TRIGGER ON public."reports" TO "authenticated";
GRANT INSERT ON public."reports" TO "service_role";
GRANT SELECT ON public."reports" TO "service_role";
GRANT UPDATE ON public."reports" TO "service_role";
GRANT DELETE ON public."reports" TO "service_role";
GRANT TRUNCATE ON public."reports" TO "service_role";
GRANT REFERENCES ON public."reports" TO "service_role";
GRANT TRIGGER ON public."reports" TO "service_role";
GRANT INSERT ON public."review_votes" TO "anon";
GRANT SELECT ON public."review_votes" TO "anon";
GRANT UPDATE ON public."review_votes" TO "anon";
GRANT DELETE ON public."review_votes" TO "anon";
GRANT TRUNCATE ON public."review_votes" TO "anon";
GRANT REFERENCES ON public."review_votes" TO "anon";
GRANT TRIGGER ON public."review_votes" TO "anon";
GRANT INSERT ON public."review_votes" TO "authenticated";
GRANT SELECT ON public."review_votes" TO "authenticated";
GRANT UPDATE ON public."review_votes" TO "authenticated";
GRANT DELETE ON public."review_votes" TO "authenticated";
GRANT TRUNCATE ON public."review_votes" TO "authenticated";
GRANT REFERENCES ON public."review_votes" TO "authenticated";
GRANT TRIGGER ON public."review_votes" TO "authenticated";
GRANT INSERT ON public."review_votes" TO "service_role";
GRANT SELECT ON public."review_votes" TO "service_role";
GRANT UPDATE ON public."review_votes" TO "service_role";
GRANT DELETE ON public."review_votes" TO "service_role";
GRANT TRUNCATE ON public."review_votes" TO "service_role";
GRANT REFERENCES ON public."review_votes" TO "service_role";
GRANT TRIGGER ON public."review_votes" TO "service_role";
GRANT INSERT ON public."stories" TO "anon";
GRANT SELECT ON public."stories" TO "anon";
GRANT UPDATE ON public."stories" TO "anon";
GRANT DELETE ON public."stories" TO "anon";
GRANT TRUNCATE ON public."stories" TO "anon";
GRANT REFERENCES ON public."stories" TO "anon";
GRANT TRIGGER ON public."stories" TO "anon";
GRANT INSERT ON public."stories" TO "authenticated";
GRANT SELECT ON public."stories" TO "authenticated";
GRANT UPDATE ON public."stories" TO "authenticated";
GRANT DELETE ON public."stories" TO "authenticated";
GRANT TRUNCATE ON public."stories" TO "authenticated";
GRANT REFERENCES ON public."stories" TO "authenticated";
GRANT TRIGGER ON public."stories" TO "authenticated";
GRANT INSERT ON public."stories" TO "service_role";
GRANT SELECT ON public."stories" TO "service_role";
GRANT UPDATE ON public."stories" TO "service_role";
GRANT DELETE ON public."stories" TO "service_role";
GRANT TRUNCATE ON public."stories" TO "service_role";
GRANT REFERENCES ON public."stories" TO "service_role";
GRANT TRIGGER ON public."stories" TO "service_role";
GRANT INSERT ON public."story_views" TO "anon";
GRANT SELECT ON public."story_views" TO "anon";
GRANT UPDATE ON public."story_views" TO "anon";
GRANT DELETE ON public."story_views" TO "anon";
GRANT TRUNCATE ON public."story_views" TO "anon";
GRANT REFERENCES ON public."story_views" TO "anon";
GRANT TRIGGER ON public."story_views" TO "anon";
GRANT INSERT ON public."story_views" TO "authenticated";
GRANT SELECT ON public."story_views" TO "authenticated";
GRANT UPDATE ON public."story_views" TO "authenticated";
GRANT DELETE ON public."story_views" TO "authenticated";
GRANT TRUNCATE ON public."story_views" TO "authenticated";
GRANT REFERENCES ON public."story_views" TO "authenticated";
GRANT TRIGGER ON public."story_views" TO "authenticated";
GRANT INSERT ON public."story_views" TO "service_role";
GRANT SELECT ON public."story_views" TO "service_role";
GRANT UPDATE ON public."story_views" TO "service_role";
GRANT DELETE ON public."story_views" TO "service_role";
GRANT TRUNCATE ON public."story_views" TO "service_role";
GRANT REFERENCES ON public."story_views" TO "service_role";
GRANT TRIGGER ON public."story_views" TO "service_role";
GRANT INSERT ON public."user_roles" TO "anon";
GRANT SELECT ON public."user_roles" TO "anon";
GRANT UPDATE ON public."user_roles" TO "anon";
GRANT DELETE ON public."user_roles" TO "anon";
GRANT TRUNCATE ON public."user_roles" TO "anon";
GRANT REFERENCES ON public."user_roles" TO "anon";
GRANT TRIGGER ON public."user_roles" TO "anon";
GRANT INSERT ON public."user_roles" TO "authenticated";
GRANT SELECT ON public."user_roles" TO "authenticated";
GRANT UPDATE ON public."user_roles" TO "authenticated";
GRANT DELETE ON public."user_roles" TO "authenticated";
GRANT TRUNCATE ON public."user_roles" TO "authenticated";
GRANT REFERENCES ON public."user_roles" TO "authenticated";
GRANT TRIGGER ON public."user_roles" TO "authenticated";
GRANT INSERT ON public."user_roles" TO "service_role";
GRANT SELECT ON public."user_roles" TO "service_role";
GRANT UPDATE ON public."user_roles" TO "service_role";
GRANT DELETE ON public."user_roles" TO "service_role";
GRANT TRUNCATE ON public."user_roles" TO "service_role";
GRANT REFERENCES ON public."user_roles" TO "service_role";
GRANT TRIGGER ON public."user_roles" TO "service_role";
GRANT INSERT ON public."venue_auto_corrections" TO "anon";
GRANT SELECT ON public."venue_auto_corrections" TO "anon";
GRANT UPDATE ON public."venue_auto_corrections" TO "anon";
GRANT DELETE ON public."venue_auto_corrections" TO "anon";
GRANT TRUNCATE ON public."venue_auto_corrections" TO "anon";
GRANT REFERENCES ON public."venue_auto_corrections" TO "anon";
GRANT TRIGGER ON public."venue_auto_corrections" TO "anon";
GRANT INSERT ON public."venue_auto_corrections" TO "authenticated";
GRANT SELECT ON public."venue_auto_corrections" TO "authenticated";
GRANT UPDATE ON public."venue_auto_corrections" TO "authenticated";
GRANT DELETE ON public."venue_auto_corrections" TO "authenticated";
GRANT TRUNCATE ON public."venue_auto_corrections" TO "authenticated";
GRANT REFERENCES ON public."venue_auto_corrections" TO "authenticated";
GRANT TRIGGER ON public."venue_auto_corrections" TO "authenticated";
GRANT INSERT ON public."venue_auto_corrections" TO "service_role";
GRANT SELECT ON public."venue_auto_corrections" TO "service_role";
GRANT UPDATE ON public."venue_auto_corrections" TO "service_role";
GRANT DELETE ON public."venue_auto_corrections" TO "service_role";
GRANT TRUNCATE ON public."venue_auto_corrections" TO "service_role";
GRANT REFERENCES ON public."venue_auto_corrections" TO "service_role";
GRANT TRIGGER ON public."venue_auto_corrections" TO "service_role";
GRANT INSERT ON public."venue_buzz_messages" TO "anon";
GRANT SELECT ON public."venue_buzz_messages" TO "anon";
GRANT UPDATE ON public."venue_buzz_messages" TO "anon";
GRANT DELETE ON public."venue_buzz_messages" TO "anon";
GRANT TRUNCATE ON public."venue_buzz_messages" TO "anon";
GRANT REFERENCES ON public."venue_buzz_messages" TO "anon";
GRANT TRIGGER ON public."venue_buzz_messages" TO "anon";
GRANT INSERT ON public."venue_buzz_messages" TO "authenticated";
GRANT SELECT ON public."venue_buzz_messages" TO "authenticated";
GRANT UPDATE ON public."venue_buzz_messages" TO "authenticated";
GRANT DELETE ON public."venue_buzz_messages" TO "authenticated";
GRANT TRUNCATE ON public."venue_buzz_messages" TO "authenticated";
GRANT REFERENCES ON public."venue_buzz_messages" TO "authenticated";
GRANT TRIGGER ON public."venue_buzz_messages" TO "authenticated";
GRANT INSERT ON public."venue_buzz_messages" TO "service_role";
GRANT SELECT ON public."venue_buzz_messages" TO "service_role";
GRANT UPDATE ON public."venue_buzz_messages" TO "service_role";
GRANT DELETE ON public."venue_buzz_messages" TO "service_role";
GRANT TRUNCATE ON public."venue_buzz_messages" TO "service_role";
GRANT REFERENCES ON public."venue_buzz_messages" TO "service_role";
GRANT TRIGGER ON public."venue_buzz_messages" TO "service_role";
GRANT INSERT ON public."venue_claim_requests" TO "anon";
GRANT SELECT ON public."venue_claim_requests" TO "anon";
GRANT UPDATE ON public."venue_claim_requests" TO "anon";
GRANT DELETE ON public."venue_claim_requests" TO "anon";
GRANT TRUNCATE ON public."venue_claim_requests" TO "anon";
GRANT REFERENCES ON public."venue_claim_requests" TO "anon";
GRANT TRIGGER ON public."venue_claim_requests" TO "anon";
GRANT INSERT ON public."venue_claim_requests" TO "authenticated";
GRANT SELECT ON public."venue_claim_requests" TO "authenticated";
GRANT UPDATE ON public."venue_claim_requests" TO "authenticated";
GRANT DELETE ON public."venue_claim_requests" TO "authenticated";
GRANT TRUNCATE ON public."venue_claim_requests" TO "authenticated";
GRANT REFERENCES ON public."venue_claim_requests" TO "authenticated";
GRANT TRIGGER ON public."venue_claim_requests" TO "authenticated";
GRANT INSERT ON public."venue_claim_requests" TO "service_role";
GRANT SELECT ON public."venue_claim_requests" TO "service_role";
GRANT UPDATE ON public."venue_claim_requests" TO "service_role";
GRANT DELETE ON public."venue_claim_requests" TO "service_role";
GRANT TRUNCATE ON public."venue_claim_requests" TO "service_role";
GRANT REFERENCES ON public."venue_claim_requests" TO "service_role";
GRANT TRIGGER ON public."venue_claim_requests" TO "service_role";
GRANT INSERT ON public."venue_location_reports" TO "anon";
GRANT SELECT ON public."venue_location_reports" TO "anon";
GRANT UPDATE ON public."venue_location_reports" TO "anon";
GRANT DELETE ON public."venue_location_reports" TO "anon";
GRANT TRUNCATE ON public."venue_location_reports" TO "anon";
GRANT REFERENCES ON public."venue_location_reports" TO "anon";
GRANT TRIGGER ON public."venue_location_reports" TO "anon";
GRANT INSERT ON public."venue_location_reports" TO "authenticated";
GRANT SELECT ON public."venue_location_reports" TO "authenticated";
GRANT UPDATE ON public."venue_location_reports" TO "authenticated";
GRANT DELETE ON public."venue_location_reports" TO "authenticated";
GRANT TRUNCATE ON public."venue_location_reports" TO "authenticated";
GRANT REFERENCES ON public."venue_location_reports" TO "authenticated";
GRANT TRIGGER ON public."venue_location_reports" TO "authenticated";
GRANT INSERT ON public."venue_location_reports" TO "service_role";
GRANT SELECT ON public."venue_location_reports" TO "service_role";
GRANT UPDATE ON public."venue_location_reports" TO "service_role";
GRANT DELETE ON public."venue_location_reports" TO "service_role";
GRANT TRUNCATE ON public."venue_location_reports" TO "service_role";
GRANT REFERENCES ON public."venue_location_reports" TO "service_role";
GRANT TRIGGER ON public."venue_location_reports" TO "service_role";
GRANT INSERT ON public."venue_notif_throttle" TO "anon";
GRANT SELECT ON public."venue_notif_throttle" TO "anon";
GRANT UPDATE ON public."venue_notif_throttle" TO "anon";
GRANT DELETE ON public."venue_notif_throttle" TO "anon";
GRANT TRUNCATE ON public."venue_notif_throttle" TO "anon";
GRANT REFERENCES ON public."venue_notif_throttle" TO "anon";
GRANT TRIGGER ON public."venue_notif_throttle" TO "anon";
GRANT INSERT ON public."venue_notif_throttle" TO "authenticated";
GRANT SELECT ON public."venue_notif_throttle" TO "authenticated";
GRANT UPDATE ON public."venue_notif_throttle" TO "authenticated";
GRANT DELETE ON public."venue_notif_throttle" TO "authenticated";
GRANT TRUNCATE ON public."venue_notif_throttle" TO "authenticated";
GRANT REFERENCES ON public."venue_notif_throttle" TO "authenticated";
GRANT TRIGGER ON public."venue_notif_throttle" TO "authenticated";
GRANT INSERT ON public."venue_notif_throttle" TO "service_role";
GRANT SELECT ON public."venue_notif_throttle" TO "service_role";
GRANT UPDATE ON public."venue_notif_throttle" TO "service_role";
GRANT DELETE ON public."venue_notif_throttle" TO "service_role";
GRANT TRUNCATE ON public."venue_notif_throttle" TO "service_role";
GRANT REFERENCES ON public."venue_notif_throttle" TO "service_role";
GRANT TRIGGER ON public."venue_notif_throttle" TO "service_role";
GRANT INSERT ON public."venue_owners" TO "anon";
GRANT SELECT ON public."venue_owners" TO "anon";
GRANT UPDATE ON public."venue_owners" TO "anon";
GRANT DELETE ON public."venue_owners" TO "anon";
GRANT TRUNCATE ON public."venue_owners" TO "anon";
GRANT REFERENCES ON public."venue_owners" TO "anon";
GRANT TRIGGER ON public."venue_owners" TO "anon";
GRANT INSERT ON public."venue_owners" TO "authenticated";
GRANT SELECT ON public."venue_owners" TO "authenticated";
GRANT UPDATE ON public."venue_owners" TO "authenticated";
GRANT DELETE ON public."venue_owners" TO "authenticated";
GRANT TRUNCATE ON public."venue_owners" TO "authenticated";
GRANT REFERENCES ON public."venue_owners" TO "authenticated";
GRANT TRIGGER ON public."venue_owners" TO "authenticated";
GRANT INSERT ON public."venue_owners" TO "service_role";
GRANT SELECT ON public."venue_owners" TO "service_role";
GRANT UPDATE ON public."venue_owners" TO "service_role";
GRANT DELETE ON public."venue_owners" TO "service_role";
GRANT TRUNCATE ON public."venue_owners" TO "service_role";
GRANT REFERENCES ON public."venue_owners" TO "service_role";
GRANT TRIGGER ON public."venue_owners" TO "service_role";
GRANT INSERT ON public."venue_promotions" TO "anon";
GRANT SELECT ON public."venue_promotions" TO "anon";
GRANT UPDATE ON public."venue_promotions" TO "anon";
GRANT DELETE ON public."venue_promotions" TO "anon";
GRANT TRUNCATE ON public."venue_promotions" TO "anon";
GRANT REFERENCES ON public."venue_promotions" TO "anon";
GRANT TRIGGER ON public."venue_promotions" TO "anon";
GRANT INSERT ON public."venue_promotions" TO "authenticated";
GRANT SELECT ON public."venue_promotions" TO "authenticated";
GRANT UPDATE ON public."venue_promotions" TO "authenticated";
GRANT DELETE ON public."venue_promotions" TO "authenticated";
GRANT TRUNCATE ON public."venue_promotions" TO "authenticated";
GRANT REFERENCES ON public."venue_promotions" TO "authenticated";
GRANT TRIGGER ON public."venue_promotions" TO "authenticated";
GRANT INSERT ON public."venue_promotions" TO "service_role";
GRANT SELECT ON public."venue_promotions" TO "service_role";
GRANT UPDATE ON public."venue_promotions" TO "service_role";
GRANT DELETE ON public."venue_promotions" TO "service_role";
GRANT TRUNCATE ON public."venue_promotions" TO "service_role";
GRANT REFERENCES ON public."venue_promotions" TO "service_role";
GRANT TRIGGER ON public."venue_promotions" TO "service_role";
GRANT INSERT ON public."venue_reviews" TO "anon";
GRANT SELECT ON public."venue_reviews" TO "anon";
GRANT UPDATE ON public."venue_reviews" TO "anon";
GRANT DELETE ON public."venue_reviews" TO "anon";
GRANT TRUNCATE ON public."venue_reviews" TO "anon";
GRANT REFERENCES ON public."venue_reviews" TO "anon";
GRANT TRIGGER ON public."venue_reviews" TO "anon";
GRANT INSERT ON public."venue_reviews" TO "authenticated";
GRANT SELECT ON public."venue_reviews" TO "authenticated";
GRANT UPDATE ON public."venue_reviews" TO "authenticated";
GRANT DELETE ON public."venue_reviews" TO "authenticated";
GRANT TRUNCATE ON public."venue_reviews" TO "authenticated";
GRANT REFERENCES ON public."venue_reviews" TO "authenticated";
GRANT TRIGGER ON public."venue_reviews" TO "authenticated";
GRANT INSERT ON public."venue_reviews" TO "service_role";
GRANT SELECT ON public."venue_reviews" TO "service_role";
GRANT UPDATE ON public."venue_reviews" TO "service_role";
GRANT DELETE ON public."venue_reviews" TO "service_role";
GRANT TRUNCATE ON public."venue_reviews" TO "service_role";
GRANT REFERENCES ON public."venue_reviews" TO "service_role";
GRANT TRIGGER ON public."venue_reviews" TO "service_role";
GRANT INSERT ON public."venue_yap_messages" TO "anon";
GRANT SELECT ON public."venue_yap_messages" TO "anon";
GRANT UPDATE ON public."venue_yap_messages" TO "anon";
GRANT DELETE ON public."venue_yap_messages" TO "anon";
GRANT TRUNCATE ON public."venue_yap_messages" TO "anon";
GRANT REFERENCES ON public."venue_yap_messages" TO "anon";
GRANT TRIGGER ON public."venue_yap_messages" TO "anon";
GRANT INSERT ON public."venue_yap_messages" TO "authenticated";
GRANT SELECT ON public."venue_yap_messages" TO "authenticated";
GRANT UPDATE ON public."venue_yap_messages" TO "authenticated";
GRANT DELETE ON public."venue_yap_messages" TO "authenticated";
GRANT TRUNCATE ON public."venue_yap_messages" TO "authenticated";
GRANT REFERENCES ON public."venue_yap_messages" TO "authenticated";
GRANT TRIGGER ON public."venue_yap_messages" TO "authenticated";
GRANT INSERT ON public."venue_yap_messages" TO "service_role";
GRANT SELECT ON public."venue_yap_messages" TO "service_role";
GRANT UPDATE ON public."venue_yap_messages" TO "service_role";
GRANT DELETE ON public."venue_yap_messages" TO "service_role";
GRANT TRUNCATE ON public."venue_yap_messages" TO "service_role";
GRANT REFERENCES ON public."venue_yap_messages" TO "service_role";
GRANT TRIGGER ON public."venue_yap_messages" TO "service_role";
GRANT INSERT ON public."wishlist_places" TO "anon";
GRANT SELECT ON public."wishlist_places" TO "anon";
GRANT UPDATE ON public."wishlist_places" TO "anon";
GRANT DELETE ON public."wishlist_places" TO "anon";
GRANT TRUNCATE ON public."wishlist_places" TO "anon";
GRANT REFERENCES ON public."wishlist_places" TO "anon";
GRANT TRIGGER ON public."wishlist_places" TO "anon";
GRANT INSERT ON public."wishlist_places" TO "authenticated";
GRANT SELECT ON public."wishlist_places" TO "authenticated";
GRANT UPDATE ON public."wishlist_places" TO "authenticated";
GRANT DELETE ON public."wishlist_places" TO "authenticated";
GRANT TRUNCATE ON public."wishlist_places" TO "authenticated";
GRANT REFERENCES ON public."wishlist_places" TO "authenticated";
GRANT TRIGGER ON public."wishlist_places" TO "authenticated";
GRANT INSERT ON public."wishlist_places" TO "service_role";
GRANT SELECT ON public."wishlist_places" TO "service_role";
GRANT UPDATE ON public."wishlist_places" TO "service_role";
GRANT DELETE ON public."wishlist_places" TO "service_role";
GRANT TRUNCATE ON public."wishlist_places" TO "service_role";
GRANT REFERENCES ON public."wishlist_places" TO "service_role";
GRANT TRIGGER ON public."wishlist_places" TO "service_role";
GRANT INSERT ON public."yap_comment_votes" TO "anon";
GRANT SELECT ON public."yap_comment_votes" TO "anon";
GRANT UPDATE ON public."yap_comment_votes" TO "anon";
GRANT DELETE ON public."yap_comment_votes" TO "anon";
GRANT TRUNCATE ON public."yap_comment_votes" TO "anon";
GRANT REFERENCES ON public."yap_comment_votes" TO "anon";
GRANT TRIGGER ON public."yap_comment_votes" TO "anon";
GRANT INSERT ON public."yap_comment_votes" TO "authenticated";
GRANT SELECT ON public."yap_comment_votes" TO "authenticated";
GRANT UPDATE ON public."yap_comment_votes" TO "authenticated";
GRANT DELETE ON public."yap_comment_votes" TO "authenticated";
GRANT TRUNCATE ON public."yap_comment_votes" TO "authenticated";
GRANT REFERENCES ON public."yap_comment_votes" TO "authenticated";
GRANT TRIGGER ON public."yap_comment_votes" TO "authenticated";
GRANT INSERT ON public."yap_comment_votes" TO "service_role";
GRANT SELECT ON public."yap_comment_votes" TO "service_role";
GRANT UPDATE ON public."yap_comment_votes" TO "service_role";
GRANT DELETE ON public."yap_comment_votes" TO "service_role";
GRANT TRUNCATE ON public."yap_comment_votes" TO "service_role";
GRANT REFERENCES ON public."yap_comment_votes" TO "service_role";
GRANT TRIGGER ON public."yap_comment_votes" TO "service_role";
GRANT INSERT ON public."yap_comments" TO "anon";
GRANT SELECT ON public."yap_comments" TO "anon";
GRANT UPDATE ON public."yap_comments" TO "anon";
GRANT DELETE ON public."yap_comments" TO "anon";
GRANT TRUNCATE ON public."yap_comments" TO "anon";
GRANT REFERENCES ON public."yap_comments" TO "anon";
GRANT TRIGGER ON public."yap_comments" TO "anon";
GRANT INSERT ON public."yap_comments" TO "authenticated";
GRANT SELECT ON public."yap_comments" TO "authenticated";
GRANT UPDATE ON public."yap_comments" TO "authenticated";
GRANT DELETE ON public."yap_comments" TO "authenticated";
GRANT TRUNCATE ON public."yap_comments" TO "authenticated";
GRANT REFERENCES ON public."yap_comments" TO "authenticated";
GRANT TRIGGER ON public."yap_comments" TO "authenticated";
GRANT INSERT ON public."yap_comments" TO "service_role";
GRANT SELECT ON public."yap_comments" TO "service_role";
GRANT UPDATE ON public."yap_comments" TO "service_role";
GRANT DELETE ON public."yap_comments" TO "service_role";
GRANT TRUNCATE ON public."yap_comments" TO "service_role";
GRANT REFERENCES ON public."yap_comments" TO "service_role";
GRANT TRIGGER ON public."yap_comments" TO "service_role";
GRANT INSERT ON public."yap_messages" TO "anon";
GRANT SELECT ON public."yap_messages" TO "anon";
GRANT UPDATE ON public."yap_messages" TO "anon";
GRANT DELETE ON public."yap_messages" TO "anon";
GRANT TRUNCATE ON public."yap_messages" TO "anon";
GRANT REFERENCES ON public."yap_messages" TO "anon";
GRANT TRIGGER ON public."yap_messages" TO "anon";
GRANT INSERT ON public."yap_messages" TO "authenticated";
GRANT SELECT ON public."yap_messages" TO "authenticated";
GRANT UPDATE ON public."yap_messages" TO "authenticated";
GRANT DELETE ON public."yap_messages" TO "authenticated";
GRANT TRUNCATE ON public."yap_messages" TO "authenticated";
GRANT REFERENCES ON public."yap_messages" TO "authenticated";
GRANT TRIGGER ON public."yap_messages" TO "authenticated";
GRANT INSERT ON public."yap_messages" TO "service_role";
GRANT SELECT ON public."yap_messages" TO "service_role";
GRANT UPDATE ON public."yap_messages" TO "service_role";
GRANT DELETE ON public."yap_messages" TO "service_role";
GRANT TRUNCATE ON public."yap_messages" TO "service_role";
GRANT REFERENCES ON public."yap_messages" TO "service_role";
GRANT TRIGGER ON public."yap_messages" TO "service_role";
GRANT INSERT ON public."yap_votes" TO "anon";
GRANT SELECT ON public."yap_votes" TO "anon";
GRANT UPDATE ON public."yap_votes" TO "anon";
GRANT DELETE ON public."yap_votes" TO "anon";
GRANT TRUNCATE ON public."yap_votes" TO "anon";
GRANT REFERENCES ON public."yap_votes" TO "anon";
GRANT TRIGGER ON public."yap_votes" TO "anon";
GRANT INSERT ON public."yap_votes" TO "authenticated";
GRANT SELECT ON public."yap_votes" TO "authenticated";
GRANT UPDATE ON public."yap_votes" TO "authenticated";
GRANT DELETE ON public."yap_votes" TO "authenticated";
GRANT TRUNCATE ON public."yap_votes" TO "authenticated";
GRANT REFERENCES ON public."yap_votes" TO "authenticated";
GRANT TRIGGER ON public."yap_votes" TO "authenticated";
GRANT INSERT ON public."yap_votes" TO "service_role";
GRANT SELECT ON public."yap_votes" TO "service_role";
GRANT UPDATE ON public."yap_votes" TO "service_role";
GRANT DELETE ON public."yap_votes" TO "service_role";
GRANT TRUNCATE ON public."yap_votes" TO "service_role";
GRANT REFERENCES ON public."yap_votes" TO "service_role";
GRANT TRIGGER ON public."yap_votes" TO "service_role";
GRANT INSERT ON public."venue_aliases" TO "service_role";
GRANT SELECT ON public."venue_aliases" TO "service_role";
GRANT UPDATE ON public."venue_aliases" TO "service_role";
GRANT DELETE ON public."venue_aliases" TO "service_role";
GRANT TRUNCATE ON public."venue_aliases" TO "service_role";
GRANT REFERENCES ON public."venue_aliases" TO "service_role";
GRANT TRIGGER ON public."venue_aliases" TO "service_role";
GRANT INSERT ON public."venue_signal_scan_state" TO "service_role";
GRANT SELECT ON public."venue_signal_scan_state" TO "service_role";
GRANT UPDATE ON public."venue_signal_scan_state" TO "service_role";
GRANT DELETE ON public."venue_signal_scan_state" TO "service_role";
GRANT TRUNCATE ON public."venue_signal_scan_state" TO "service_role";
GRANT REFERENCES ON public."venue_signal_scan_state" TO "service_role";
GRANT TRIGGER ON public."venue_signal_scan_state" TO "service_role";
GRANT INSERT ON public."profiles" TO "anon";
GRANT SELECT ON public."profiles" TO "anon";
GRANT UPDATE ON public."profiles" TO "anon";
GRANT DELETE ON public."profiles" TO "anon";
GRANT TRUNCATE ON public."profiles" TO "anon";
GRANT REFERENCES ON public."profiles" TO "anon";
GRANT TRIGGER ON public."profiles" TO "anon";
GRANT INSERT ON public."profiles" TO "authenticated";
GRANT SELECT ON public."profiles" TO "authenticated";
GRANT UPDATE ON public."profiles" TO "authenticated";
GRANT DELETE ON public."profiles" TO "authenticated";
GRANT TRUNCATE ON public."profiles" TO "authenticated";
GRANT REFERENCES ON public."profiles" TO "authenticated";
GRANT TRIGGER ON public."profiles" TO "authenticated";
GRANT INSERT ON public."profiles" TO "service_role";
GRANT SELECT ON public."profiles" TO "service_role";
GRANT UPDATE ON public."profiles" TO "service_role";
GRANT DELETE ON public."profiles" TO "service_role";
GRANT TRUNCATE ON public."profiles" TO "service_role";
GRANT REFERENCES ON public."profiles" TO "service_role";
GRANT TRIGGER ON public."profiles" TO "service_role";
GRANT INSERT ON public."venues" TO "anon";
GRANT SELECT ON public."venues" TO "anon";
GRANT UPDATE ON public."venues" TO "anon";
GRANT DELETE ON public."venues" TO "anon";
GRANT TRUNCATE ON public."venues" TO "anon";
GRANT REFERENCES ON public."venues" TO "anon";
GRANT TRIGGER ON public."venues" TO "anon";
GRANT INSERT ON public."venues" TO "authenticated";
GRANT SELECT ON public."venues" TO "authenticated";
GRANT UPDATE ON public."venues" TO "authenticated";
GRANT DELETE ON public."venues" TO "authenticated";
GRANT TRUNCATE ON public."venues" TO "authenticated";
GRANT REFERENCES ON public."venues" TO "authenticated";
GRANT TRIGGER ON public."venues" TO "authenticated";
GRANT INSERT ON public."venues" TO "service_role";
GRANT SELECT ON public."venues" TO "service_role";
GRANT UPDATE ON public."venues" TO "service_role";
GRANT DELETE ON public."venues" TO "service_role";
GRANT TRUNCATE ON public."venues" TO "service_role";
GRANT REFERENCES ON public."venues" TO "service_role";
GRANT TRIGGER ON public."venues" TO "service_role";
GRANT INSERT ON public."mux_asset_deletions" TO "anon";
GRANT SELECT ON public."mux_asset_deletions" TO "anon";
GRANT UPDATE ON public."mux_asset_deletions" TO "anon";
GRANT DELETE ON public."mux_asset_deletions" TO "anon";
GRANT TRUNCATE ON public."mux_asset_deletions" TO "anon";
GRANT REFERENCES ON public."mux_asset_deletions" TO "anon";
GRANT TRIGGER ON public."mux_asset_deletions" TO "anon";
GRANT INSERT ON public."mux_asset_deletions" TO "authenticated";
GRANT SELECT ON public."mux_asset_deletions" TO "authenticated";
GRANT UPDATE ON public."mux_asset_deletions" TO "authenticated";
GRANT DELETE ON public."mux_asset_deletions" TO "authenticated";
GRANT TRUNCATE ON public."mux_asset_deletions" TO "authenticated";
GRANT REFERENCES ON public."mux_asset_deletions" TO "authenticated";
GRANT TRIGGER ON public."mux_asset_deletions" TO "authenticated";
GRANT INSERT ON public."mux_asset_deletions" TO "service_role";
GRANT SELECT ON public."mux_asset_deletions" TO "service_role";
GRANT UPDATE ON public."mux_asset_deletions" TO "service_role";
GRANT DELETE ON public."mux_asset_deletions" TO "service_role";
GRANT TRUNCATE ON public."mux_asset_deletions" TO "service_role";
GRANT REFERENCES ON public."mux_asset_deletions" TO "service_role";
GRANT TRIGGER ON public."mux_asset_deletions" TO "service_role";
GRANT INSERT ON public."location_events" TO "anon";
GRANT SELECT ON public."location_events" TO "anon";
GRANT UPDATE ON public."location_events" TO "anon";
GRANT DELETE ON public."location_events" TO "anon";
GRANT TRUNCATE ON public."location_events" TO "anon";
GRANT REFERENCES ON public."location_events" TO "anon";
GRANT TRIGGER ON public."location_events" TO "anon";
GRANT INSERT ON public."location_events" TO "authenticated";
GRANT SELECT ON public."location_events" TO "authenticated";
GRANT UPDATE ON public."location_events" TO "authenticated";
GRANT DELETE ON public."location_events" TO "authenticated";
GRANT TRUNCATE ON public."location_events" TO "authenticated";
GRANT REFERENCES ON public."location_events" TO "authenticated";
GRANT TRIGGER ON public."location_events" TO "authenticated";
GRANT INSERT ON public."location_events" TO "service_role";
GRANT SELECT ON public."location_events" TO "service_role";
GRANT UPDATE ON public."location_events" TO "service_role";
GRANT DELETE ON public."location_events" TO "service_role";
GRANT TRUNCATE ON public."location_events" TO "service_role";
GRANT REFERENCES ON public."location_events" TO "service_role";
GRANT TRIGGER ON public."location_events" TO "service_role";
GRANT INSERT ON public."location_hidden" TO "anon";
GRANT SELECT ON public."location_hidden" TO "anon";
GRANT UPDATE ON public."location_hidden" TO "anon";
GRANT DELETE ON public."location_hidden" TO "anon";
GRANT TRUNCATE ON public."location_hidden" TO "anon";
GRANT REFERENCES ON public."location_hidden" TO "anon";
GRANT TRIGGER ON public."location_hidden" TO "anon";
GRANT INSERT ON public."location_hidden" TO "authenticated";
GRANT SELECT ON public."location_hidden" TO "authenticated";
GRANT UPDATE ON public."location_hidden" TO "authenticated";
GRANT DELETE ON public."location_hidden" TO "authenticated";
GRANT TRUNCATE ON public."location_hidden" TO "authenticated";
GRANT REFERENCES ON public."location_hidden" TO "authenticated";
GRANT TRIGGER ON public."location_hidden" TO "authenticated";
GRANT INSERT ON public."location_hidden" TO "service_role";
GRANT SELECT ON public."location_hidden" TO "service_role";
GRANT UPDATE ON public."location_hidden" TO "service_role";
GRANT DELETE ON public."location_hidden" TO "service_role";
GRANT TRUNCATE ON public."location_hidden" TO "service_role";
GRANT REFERENCES ON public."location_hidden" TO "service_role";
GRANT TRIGGER ON public."location_hidden" TO "service_role";
CREATE TRIGGER trigger_update_post_likes AFTER INSERT OR DELETE ON public.post_likes FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();
CREATE TRIGGER trigger_update_post_comments AFTER INSERT OR DELETE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();
CREATE TRIGGER trigger_update_comment_likes AFTER INSERT OR DELETE ON public.post_comment_likes FOR EACH ROW EXECUTE FUNCTION update_comment_likes_count();
CREATE TRIGGER trigger_update_yap_comments AFTER INSERT OR DELETE ON public.yap_comments FOR EACH ROW EXECUTE FUNCTION update_yap_comments_count();
CREATE TRIGGER trigger_update_plan_score AFTER INSERT OR DELETE OR UPDATE ON public.plan_votes FOR EACH ROW EXECUTE FUNCTION update_plan_score();
CREATE TRIGGER trigger_update_plan_comments AFTER INSERT OR DELETE ON public.plan_comments FOR EACH ROW EXECUTE FUNCTION update_plan_comments_count();
CREATE TRIGGER trigger_notify_post_liked AFTER INSERT ON public.post_likes FOR EACH ROW EXECUTE FUNCTION notify_post_liked();
CREATE TRIGGER trigger_notify_post_commented AFTER INSERT ON public.post_comments FOR EACH ROW EXECUTE FUNCTION notify_post_commented();
CREATE TRIGGER trigger_auto_correct_venue AFTER INSERT ON public.venue_location_reports FOR EACH ROW EXECUTE FUNCTION check_and_auto_correct_venue();
CREATE TRIGGER block_cleanup_trigger AFTER INSERT ON public.blocked_users FOR EACH ROW EXECUTE FUNCTION on_block_cleanup();
CREATE TRIGGER guard_is_demo_profiles BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW WHEN ((new.is_demo = true)) EXECUTE FUNCTION guard_is_demo_flag();
CREATE TRIGGER guard_is_demo_night_statuses BEFORE INSERT OR UPDATE ON public.night_statuses FOR EACH ROW WHEN ((new.is_demo = true)) EXECUTE FUNCTION guard_is_demo_flag();
CREATE TRIGGER guard_is_demo_checkins BEFORE INSERT OR UPDATE ON public.checkins FOR EACH ROW WHEN ((new.is_demo = true)) EXECUTE FUNCTION guard_is_demo_flag();
CREATE TRIGGER night_status_party_location_guard BEFORE INSERT OR UPDATE ON public.night_statuses FOR EACH ROW EXECUTE FUNCTION night_status_party_location_guard();
CREATE TRIGGER profile_party_location_guard BEFORE INSERT OR UPDATE OF last_known_lat, last_known_lng ON public.profiles FOR EACH ROW EXECUTE FUNCTION profile_party_location_guard();
CREATE TRIGGER posts_queue_mux_asset_deletion AFTER DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION queue_mux_asset_deletion();
CREATE TRIGGER posts_queue_replaced_mux_asset AFTER UPDATE OF mux_asset_id ON public.posts FOR EACH ROW EXECUTE FUNCTION queue_replaced_mux_asset();
CREATE TRIGGER yap_comments_sync_count AFTER INSERT OR DELETE ON public.yap_comments FOR EACH ROW EXECUTE FUNCTION sync_yap_comments_count();
CREATE TRIGGER enforce_leaderboard_eligibility BEFORE INSERT OR UPDATE OF leaderboard_category, type, is_demo, popularity_rank, is_leaderboard_promoted, leaderboard_promo_order ON public.venues FOR EACH ROW EXECUTE FUNCTION internal.enforce_leaderboard_eligibility();
CREATE TRIGGER clear_live_location_state AFTER UPDATE ON public.night_statuses FOR EACH ROW EXECUTE FUNCTION clear_live_location_state();
REVOKE ALL ON FUNCTION public._can_see_location_unchecked(viewer_id uuid, target_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._can_see_location_unchecked(viewer_id uuid, target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public._can_see_location_unchecked(viewer_id uuid, target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._can_see_location_unchecked(viewer_id uuid, target_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.can_see_planning(viewer_id uuid, target_user_id uuid, visibility text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_planning(viewer_id uuid, target_user_id uuid, visibility text) TO anon;
GRANT EXECUTE ON FUNCTION public.can_see_planning(viewer_id uuid, target_user_id uuid, visibility text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_planning(viewer_id uuid, target_user_id uuid, visibility text) TO service_role;
REVOKE ALL ON FUNCTION public.check_and_auto_correct_venue() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_auto_correct_venue() TO anon;
GRANT EXECUTE ON FUNCTION public.check_and_auto_correct_venue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_auto_correct_venue() TO service_role;
REVOKE ALL ON FUNCTION public.check_rate_limit(p_user_id uuid, p_action_type text, p_window_hours integer, p_max_count integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(p_user_id uuid, p_action_type text, p_window_hours integer, p_max_count integer) TO anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(p_user_id uuid, p_action_type text, p_window_hours integer, p_max_count integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(p_user_id uuid, p_action_type text, p_window_hours integer, p_max_count integer) TO service_role;
REVOKE ALL ON FUNCTION public.cleanup_old_checkins() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_checkins() TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_checkins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_checkins() TO service_role;
REVOKE ALL ON FUNCTION public.cleanup_old_rate_limits() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits() TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits() TO service_role;
REVOKE ALL ON FUNCTION public.cleanup_venue_notif_throttle() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_venue_notif_throttle() TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_venue_notif_throttle() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_venue_notif_throttle() TO service_role;
REVOKE ALL ON FUNCTION public.clear_live_location_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_live_location_state() TO service_role;
REVOKE ALL ON FUNCTION public.clear_stale_push_token(p_token text, p_keep_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_stale_push_token(p_token text, p_keep_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.clear_stale_push_token(p_token text, p_keep_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_stale_push_token(p_token text, p_keep_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_dm_thread(friend_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_dm_thread(friend_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.create_dm_thread(friend_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_dm_thread(friend_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_group_thread(group_name text, member_ids uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_thread(group_name text, member_ids uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.create_group_thread(group_name text, member_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_thread(group_name text, member_ids uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.create_notification(p_receiver_id uuid, p_type text, p_message text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(p_receiver_id uuid, p_type text, p_message text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_notification(p_receiver_id uuid, p_type text, p_message text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(p_receiver_id uuid, p_type text, p_message text) TO service_role;
REVOKE ALL ON FUNCTION public.create_notifications_batch(p_notifications jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_notifications_batch(p_notifications jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.create_notifications_batch(p_notifications jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notifications_batch(p_notifications jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.create_venue_from_discovery(p_name text, p_lat double precision, p_lng double precision, p_neighborhood text, p_type text, p_city text, p_google_place_id text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_venue_from_discovery(p_name text, p_lat double precision, p_lng double precision, p_neighborhood text, p_type text, p_city text, p_google_place_id text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_venue_from_discovery(p_name text, p_lat double precision, p_lng double precision, p_neighborhood text, p_type text, p_city text, p_google_place_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_venue_from_discovery(p_name text, p_lat double precision, p_lng double precision, p_neighborhood text, p_type text, p_city text, p_google_place_id text) TO service_role;
REVOKE ALL ON FUNCTION public.find_nearby_venues(user_lat double precision, user_lng double precision, radius_meters double precision, max_results integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearby_venues(user_lat double precision, user_lng double precision, radius_meters double precision, max_results integer) TO anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_venues(user_lat double precision, user_lng double precision, radius_meters double precision, max_results integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearby_venues(user_lat double precision, user_lng double precision, radius_meters double precision, max_results integer) TO service_role;
REVOKE ALL ON FUNCTION public.find_nearest_venue(user_lat double precision, user_lng double precision, radius_meters double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearest_venue(user_lat double precision, user_lng double precision, radius_meters double precision) TO anon;
GRANT EXECUTE ON FUNCTION public.find_nearest_venue(user_lat double precision, user_lng double precision, radius_meters double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearest_venue(user_lat double precision, user_lng double precision, radius_meters double precision) TO service_role;
REVOKE ALL ON FUNCTION public.get_morning_after_user_posts(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_morning_after_user_posts(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.get_morning_after_user_posts(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_morning_after_user_posts(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.get_morning_after_yaps(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_morning_after_yaps(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.get_morning_after_yaps(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_morning_after_yaps(p_user_id uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.get_mutual_friend_ids(p_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_mutual_friend_ids(p_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_mutual_friend_ids(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mutual_friend_ids(p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_mutual_friends_with(p_other_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_mutual_friends_with(p_other_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mutual_friends_with(p_other_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_neighborhood_venue_leaderboard(p_city text, p_neighborhood text, p_limit integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighborhood_venue_leaderboard(p_city text, p_neighborhood text, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighborhood_venue_leaderboard(p_city text, p_neighborhood text, p_limit integer) TO service_role;
REVOKE ALL ON FUNCTION public.get_party_address(p_status_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_party_address(p_status_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_party_address(p_status_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_party_address(p_status_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_profiles_safe() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_profiles_safe() TO anon;
GRANT EXECUTE ON FUNCTION public.get_profiles_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profiles_safe() TO service_role;
REVOKE ALL ON FUNCTION public.get_venue_leaderboard(p_city text, p_limit integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_leaderboard(p_city text, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_leaderboard(p_city text, p_limit integer) TO service_role;
REVOKE ALL ON FUNCTION public.get_visible_recipients(candidate_ids uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_recipients(candidate_ids uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_visible_recipients(candidate_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_recipients(candidate_ids uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.guard_is_demo_flag() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_is_demo_flag() TO anon;
GRANT EXECUTE ON FUNCTION public.guard_is_demo_flag() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_is_demo_flag() TO service_role;
REVOKE ALL ON FUNCTION public.has_role(user_id uuid, role app_role) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(user_id uuid, role app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(user_id uuid, role app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(user_id uuid, role app_role) TO service_role;
REVOKE ALL ON FUNCTION public.invoke_mux_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_mux_cleanup() TO anon;
GRANT EXECUTE ON FUNCTION public.invoke_mux_cleanup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_mux_cleanup() TO service_role;
REVOKE ALL ON FUNCTION public.is_close_friend(viewer_id uuid, target_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_close_friend(viewer_id uuid, target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_close_friend(viewer_id uuid, target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_close_friend(viewer_id uuid, target_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_demo_user(_uid uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_demo_user(_uid uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_demo_user(_uid uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_demo_user(_uid uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_direct_friend(viewer_id uuid, target_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_direct_friend(viewer_id uuid, target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_direct_friend(viewer_id uuid, target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_direct_friend(viewer_id uuid, target_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_friend_or_mutual(viewer_id uuid, target_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_friend_or_mutual(viewer_id uuid, target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_friend_or_mutual(viewer_id uuid, target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_friend_or_mutual(viewer_id uuid, target_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_mutual_friend(viewer_id uuid, target_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_mutual_friend(viewer_id uuid, target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_mutual_friend(viewer_id uuid, target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mutual_friend(viewer_id uuid, target_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_venue_owner(user_id uuid, venue_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_venue_owner(user_id uuid, venue_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_venue_owner(user_id uuid, venue_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_venue_owner(user_id uuid, venue_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.live_distance_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.live_distance_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.live_distance_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision) TO service_role;
REVOKE ALL ON FUNCTION public.match_phones(phone_list text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_phones(phone_list text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.match_phones(phone_list text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_phones(phone_list text[]) TO service_role;
REVOKE ALL ON FUNCTION public.night_start_at(p_city text, p_at timestamp with time zone) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.night_start_at(p_city text, p_at timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.night_start_at(p_city text, p_at timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.night_start_at(p_city text, p_at timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.night_status_party_location_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.night_status_party_location_guard() TO anon;
GRANT EXECUTE ON FUNCTION public.night_status_party_location_guard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.night_status_party_location_guard() TO service_role;
REVOKE ALL ON FUNCTION public.nightly_reset() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nightly_reset() TO service_role;
REVOKE ALL ON FUNCTION public.notify_post_commented() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notify_post_commented() TO anon;
GRANT EXECUTE ON FUNCTION public.notify_post_commented() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_post_commented() TO service_role;
REVOKE ALL ON FUNCTION public.notify_post_liked() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notify_post_liked() TO anon;
GRANT EXECUTE ON FUNCTION public.notify_post_liked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_post_liked() TO service_role;
REVOKE ALL ON FUNCTION public.on_block_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.on_block_cleanup() TO anon;
GRANT EXECUTE ON FUNCTION public.on_block_cleanup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.on_block_cleanup() TO service_role;
REVOKE ALL ON FUNCTION public.process_invite_code(invite_code text, new_user_id uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_invite_code(invite_code text, new_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.process_invite_code(invite_code text, new_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_invite_code(invite_code text, new_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.profile_party_location_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.profile_party_location_guard() TO anon;
GRANT EXECUTE ON FUNCTION public.profile_party_location_guard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_party_location_guard() TO service_role;
REVOKE ALL ON FUNCTION public.queue_mux_asset_deletion() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_mux_asset_deletion() TO anon;
GRANT EXECUTE ON FUNCTION public.queue_mux_asset_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_mux_asset_deletion() TO service_role;
REVOKE ALL ON FUNCTION public.queue_replaced_mux_asset() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_replaced_mux_asset() TO anon;
GRANT EXECUTE ON FUNCTION public.queue_replaced_mux_asset() TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_replaced_mux_asset() TO service_role;
REVOKE ALL ON FUNCTION public.record_live_location(p_lat double precision, p_lng double precision, p_accuracy double precision, p_recorded_at timestamp with time zone, p_status_updated_at timestamp with time zone, p_speed double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_live_location(p_lat double precision, p_lng double precision, p_accuracy double precision, p_recorded_at timestamp with time zone, p_status_updated_at timestamp with time zone, p_speed double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_live_location(p_lat double precision, p_lng double precision, p_accuracy double precision, p_recorded_at timestamp with time zone, p_status_updated_at timestamp with time zone, p_speed double precision) TO service_role;
REVOKE ALL ON FUNCTION public.record_rate_limited_action(p_action_type text, p_window_hours integer, p_max_count integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_rate_limited_action(p_action_type text, p_window_hours integer, p_max_count integer) TO anon;
GRANT EXECUTE ON FUNCTION public.record_rate_limited_action(p_action_type text, p_window_hours integer, p_max_count integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_rate_limited_action(p_action_type text, p_window_hours integer, p_max_count integer) TO service_role;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO anon;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
REVOKE ALL ON FUNCTION public.sync_yap_comments_count() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_yap_comments_count() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_yap_comments_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_yap_comments_count() TO service_role;
REVOKE ALL ON FUNCTION public.update_comment_likes_count() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_comment_likes_count() TO anon;
GRANT EXECUTE ON FUNCTION public.update_comment_likes_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_comment_likes_count() TO service_role;
REVOKE ALL ON FUNCTION public.update_plan_comments_count() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_plan_comments_count() TO anon;
GRANT EXECUTE ON FUNCTION public.update_plan_comments_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_plan_comments_count() TO service_role;
REVOKE ALL ON FUNCTION public.update_plan_score() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_plan_score() TO anon;
GRANT EXECUTE ON FUNCTION public.update_plan_score() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_plan_score() TO service_role;
REVOKE ALL ON FUNCTION public.update_post_comments_count() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_post_comments_count() TO anon;
GRANT EXECUTE ON FUNCTION public.update_post_comments_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_post_comments_count() TO service_role;
REVOKE ALL ON FUNCTION public.update_post_likes_count() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_post_likes_count() TO anon;
GRANT EXECUTE ON FUNCTION public.update_post_likes_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_post_likes_count() TO service_role;
REVOKE ALL ON FUNCTION public.update_yap_comments_count() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_yap_comments_count() TO anon;
GRANT EXECUTE ON FUNCTION public.update_yap_comments_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_yap_comments_count() TO service_role;
REVOKE ALL ON FUNCTION public.user_is_thread_member(thread_uuid uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_thread_member(thread_uuid uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_is_thread_member(thread_uuid uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_thread_member(thread_uuid uuid) TO service_role;
REVOKE ALL ON FUNCTION public.validate_invite_code(code_to_check text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(code_to_check text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(code_to_check text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(code_to_check text) TO service_role;
REVOKE ALL ON FUNCTION public.verify_venue_collector_secret(p_secret text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_venue_collector_secret(p_secret text) TO service_role;
REVOKE ALL ON FUNCTION public.vote_on_yap(p_yap_id uuid, p_vote_type text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vote_on_yap(p_yap_id uuid, p_vote_type text) TO anon;
GRANT EXECUTE ON FUNCTION public.vote_on_yap(p_yap_id uuid, p_vote_type text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vote_on_yap(p_yap_id uuid, p_vote_type text) TO service_role;
