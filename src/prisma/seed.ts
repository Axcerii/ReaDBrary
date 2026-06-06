import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { auth } from '../auth/auth';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

export async function seed(prismaInstance?: any) {
  const db = prismaInstance || prisma;
  console.log('🌱 Starting database seeding...');

  // 1. Clean existing database
  console.log('🧹 Cleaning existing database...');
  await db.progression.deleteMany();
  await db.review.deleteMany();
  await db.chapter.deleteMany();
  await db.book.deleteMany();
  await db.clubMember.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();
  await db.club.deleteMany();

  // 2. Create Users using Better Auth programmatic signup
  console.log('👥 Creating users...');
  const usersToCreate = [
    { email: 'admin@readbrary.com', password: 'AdminPassword123!', name: 'Admin Reader', role: 'ADMIN' },
    { email: 'owner@readbrary.com', password: 'OwnerPassword123!', name: 'Club Owner', role: 'USER' },
    { email: 'reader1@readbrary.com', password: 'ReaderPassword123!', name: 'Alice Reader', role: 'USER' },
    { email: 'reader2@readbrary.com', password: 'ReaderPassword123!', name: 'Bob Reader', role: 'USER' },
  ];

  const createdUsers: Record<string, any> = {};

  for (const u of usersToCreate) {
    const signupResult = await auth.api.signUpEmail({
      body: {
        email: u.email,
        password: u.password,
        name: u.name,
      },
      headers: new Headers(),
    });

    if (!signupResult || !signupResult.user) {
      throw new Error(`Failed to sign up user: ${u.email}`);
    }

    // Set the correct role in the database (better-auth defaults to USER, but we want ADMIN for the admin)
    const updatedUser = await db.user.update({
      where: { id: signupResult.user.id },
      data: {
        role: u.role as any,
        emailVerified: true,
      },
    });

    createdUsers[u.email] = updatedUser;
    console.log(`👤 Created user: ${u.name} (${u.email}) with role: ${u.role}`);
  }

  // 3. Create Clubs
  console.log('📚 Creating clubs...');
  const clubClassiques = await db.club.create({
    data: {
      name: 'Le Club des Classiques',
      slug: 'le-club-des-classiques',
      isActive: true,
      isPublic: true,
    },
  });

  const clubSF = await db.club.create({
    data: {
      name: 'Science-Fiction & Fantasy',
      slug: 'science-fiction-fantasy',
      isActive: true,
      isPublic: true,
    },
  });

  const clubInactif = await db.club.create({
    data: {
      name: 'Club Privé Inactif',
      slug: 'club-prive-inactif',
      isActive: false,
      isPublic: false,
    },
  });

  const clubSecret = await db.club.create({
    data: {
      name: 'Cercle de l’Ombre',
      slug: 'cercle-de-l-ombre',
      isActive: true,
      isPublic: false,
    },
  });

  console.log('✅ Created clubs.');

  // 4. Create Club Memberships
  console.log('🔗 Assigning memberships...');
  // Club des Classiques
  await db.clubMember.createMany({
    data: [
      { clubId: clubClassiques.id, userId: createdUsers['owner@readbrary.com'].id, role: 'OWNER' },
      { clubId: clubClassiques.id, userId: createdUsers['reader1@readbrary.com'].id, role: 'READER' },
      { clubId: clubClassiques.id, userId: createdUsers['reader2@readbrary.com'].id, role: 'READER' },
    ],
  });

  // Science-Fiction & Fantasy
  await db.clubMember.createMany({
    data: [
      { clubId: clubSF.id, userId: createdUsers['reader1@readbrary.com'].id, role: 'OWNER' },
      { clubId: clubSF.id, userId: createdUsers['reader2@readbrary.com'].id, role: 'EDITOR' },
      { clubId: clubSF.id, userId: createdUsers['owner@readbrary.com'].id, role: 'READER' },
    ],
  });

  // Inactive Club
  await db.clubMember.createMany({
    data: [
      { clubId: clubInactif.id, userId: createdUsers['owner@readbrary.com'].id, role: 'OWNER' },
      { clubId: clubInactif.id, userId: createdUsers['reader1@readbrary.com'].id, role: 'READER' },
    ],
  });

  // Secret Club
  await db.clubMember.create({
    data: { clubId: clubSecret.id, userId: createdUsers['owner@readbrary.com'].id, role: 'OWNER' },
  });

  // Seed pending join request
  console.log('📬 Seeding pending join requests...');
  await db.clubJoinRequest.create({
    data: {
      clubId: clubSecret.id,
      userId: createdUsers['reader2@readbrary.com'].id,
    },
  });

  console.log('✅ Assigned memberships.');

  // 5. Create Books
  console.log('📖 Creating books...');
  const bookPrince = await db.book.create({
    data: {
      title: 'Le Petit Prince',
      author: 'Antoine de Saint-Exupéry',
      genre: 'Fable',
      pages: 96,
      isActive: true,
      clubId: clubClassiques.id,
    },
  });

  const bookMiserables = await db.book.create({
    data: {
      title: 'Les Misérables',
      author: 'Victor Hugo',
      genre: 'Roman historique',
      pages: 1488,
      isActive: true,
      clubId: clubClassiques.id,
    },
  });

  const bookDune = await db.book.create({
    data: {
      title: 'Dune',
      author: 'Frank Herbert',
      genre: 'Science-Fiction',
      pages: 896,
      isActive: true,
      clubId: clubSF.id,
    },
  });

  const bookHobbit = await db.book.create({
    data: {
      title: 'Le Hobbit',
      author: 'J.R.R. Tolkien',
      genre: 'Fantasy',
      pages: 310,
      isActive: true,
      clubId: clubSF.id,
    },
  });

  const bookInactif = await db.book.create({
    data: {
      title: 'Livre Secret Inactif',
      author: 'Auteur Inconnu',
      genre: 'Mystère',
      pages: 150,
      isActive: false,
      clubId: clubClassiques.id,
    },
  });

  console.log('✅ Created books.');

  // 6. Create Chapters
  console.log('🔖 Creating chapters...');
  await db.chapter.createMany({
    data: [
      {
        bookId: bookPrince.id,
        index: 1,
        title: 'Chapitre I: Le dessin de boa',
        content: "Lorsque j'avais six ans j'ai vu, une fois, une magnifique image, dans un livre sur la Forêt Vierge qui s'appelait « Histoires Vécues ».",
      },
      {
        bookId: bookPrince.id,
        index: 2,
        title: 'Chapitre II: La panne et la rencontre',
        content: "J'ai ainsi vécu seul, sans personne avec qui parler véritablement, jusqu'à une panne dans le désert du Sahara, il y a six ans. Quelque chose s'était cassé dans mon moteur.",
      },
      {
        bookId: bookPrince.id,
        index: 3,
        title: 'Chapitre III: La fleur du Petit Prince',
        content: "Il me fallut longtemps pour comprendre d'où il venait. Le petit prince, qui me posait beaucoup de questions, ne semblait jamais entendre les miennes.",
      },
      {
        bookId: bookDune.id,
        index: 1,
        title: "Chapitre I: L'épreuve du Gom Jabbar",
        content: "Dans la semaine qui précéda le départ pour Arrakis, alors que la frénésie des préparatifs avait atteint son comble, une vieille femme vint rendre visite à la mère du garçon, la Dame Jessica.",
      },
      {
        bookId: bookDune.id,
        index: 2,
        title: 'Chapitre II: Complot sur Giedi Prime',
        content: "C'était une pièce en forme de globe, faiblement éclairée par des suspenseurs. Au centre se tenait le Baron Vladimir Harkonnen.",
      },
    ],
  });

  console.log('✅ Created chapters.');

  // 7. Create Reviews
  console.log('⭐️ Creating reviews...');
  await db.review.createMany({
    data: [
      {
        bookId: bookPrince.id,
        userId: createdUsers['reader1@readbrary.com'].id,
        rating: 5,
        comment: 'Un chef-d’œuvre intemporel et poétique qui parle à l’enfant en chacun de nous.',
      },
      {
        bookId: bookPrince.id,
        userId: createdUsers['reader2@readbrary.com'].id,
        rating: 4,
        comment: 'Une très belle histoire, douce et pleine de mélancolie.',
      },
      {
        bookId: bookDune.id,
        userId: createdUsers['owner@readbrary.com'].id,
        rating: 5,
        comment: 'Le monument incontestable de la science-fiction. Riche, politique et fascinant.',
      },
    ],
  });

  console.log('✅ Created reviews.');

  // 8. Create Progressions
  console.log('📈 Creating progressions...');
  await db.progression.createMany({
    data: [
      {
        bookId: bookPrince.id,
        userId: createdUsers['reader1@readbrary.com'].id,
        currentPage: 45,
      },
      {
        bookId: bookPrince.id,
        userId: createdUsers['reader2@readbrary.com'].id,
        currentPage: 96, // Finished
      },
      {
        bookId: bookDune.id,
        userId: createdUsers['reader2@readbrary.com'].id,
        currentPage: 250,
      },
    ],
  });

  console.log('✅ Created progressions.');
  console.log('🌱 Database seeding completed successfully!');
}
