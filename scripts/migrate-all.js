const { execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '../.env') });

try {
    // 1. Run migrations on the main database
    console.log('🔄 Running migrations on the development database...');
    execSync('npx prisma migrate dev', { stdio: 'inherit' });

    // 2. Construct the test database URL dynamically
    const user = process.env.POSTGRES_USER;
    const pass = process.env.POSTGRES_PASSWORD;
    const port = process.env.POSTGRES_PORT_TEST;
    const db = process.env.POSTGRES_DB;

    if (!user || !pass || !port || !db) {
        throw new Error('Missing necessary POSTGRES_ variables in .env file to construct the test database URL.');
    }

    const testDbUrl = `postgresql://${user}:${pass}@localhost:${port}/${db}-test?schema=public`;

    // 3. Run migrations on the test database
    console.log('\n🔄 Running migrations on the test database...');
    execSync('npx prisma migrate deploy', { 
        env: { ...process.env, DATABASE_URL: testDbUrl },
        stdio: 'inherit' 
    });

    console.log('\n✅ All migrations completed successfully!');
} catch (error) {
    console.error('\n❌ Error running migrations:', error.message);
    process.exit(1);
}
