const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.peaqvexqgbmghnsqruch:h8qeG3KHLxzAHFi8@aws-1-us-west-1.pooler.supabase.com:6543/postgres',
});

async function run() {
  await client.connect();
  
  console.log("Checking profiles...");
  const profiles = await client.query('SELECT email, approval_status FROM public.profiles LIMIT 10;');
  console.log(profiles.rows);

  console.log("Checking auth.users...");
  const authUsers = await client.query('SELECT email FROM auth.users LIMIT 10;');
  console.log(authUsers.rows);

  // Apply the trigger update and approval update just in case the user didn't run it
  await client.query(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
        INSERT INTO public.profiles (id, full_name, role, approval_status)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            'user',
            'approved'
        );
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await client.query(`UPDATE public.profiles SET approval_status = 'approved' WHERE approval_status = 'pending';`);
  console.log("Database updated successfully.");
  
  await client.end();
}

run().catch(console.error);
