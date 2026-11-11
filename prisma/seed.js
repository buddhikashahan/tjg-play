const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const sampleVideos = [
  {
    youtubeUrl: "https://www.youtube.com/watch?v=LXb3EKWsInQ",
    youtubeId: "LXb3EKWsInQ",
    title: "Costa Rica in 4K 60fps HDR (Ultra HD)",
    thumbnailUrl: "https://i.ytimg.com/vi/LXb3EKWsInQ/hqdefault.jpg",
    author: "Jacob + Katie Schwarz",
    authorImageUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    subject: "Nature & Wildlife",
    tags: JSON.stringify(["nature", "4k", "animals", "wildlife", "hdr"]),
    rating: 5,
    isArchived: true,
    notes: [
      {
        content: "Breathtaking tree frog close-up shots at the 1-minute mark. Perfect for TV screen testing.",
        videoTimestamp: 64,
      },
      {
        content: "Stunning colors on OLED display. Very calming nature sounds.",
        videoTimestamp: 180,
      },
    ],
  },
  {
    youtubeUrl: "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
    youtubeId: "kJQP7kiw5Fk",
    title: "Luis Fonsi - Despacito ft. Daddy Yankee",
    thumbnailUrl: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg",
    author: "Luis Fonsi",
    authorImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    subject: "Music",
    tags: JSON.stringify(["music", "latin", "dance", "hit", "summer"]),
    rating: 4,
    isArchived: false,
    notes: [
      {
        content: "Catchy rhythm, good volume level for TV audio testing.",
        videoTimestamp: 45,
      },
    ],
  },
  {
    youtubeUrl: "https://www.youtube.com/watch?v=21X5lGlDOfg",
    youtubeId: "21X5lGlDOfg",
    title: "NASA 4K Earth Views from the Space Station",
    thumbnailUrl: "https://i.ytimg.com/vi/21X5lGlDOfg/hqdefault.jpg",
    author: "NASA",
    authorImageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=150&auto=format&fit=crop&q=80",
    subject: "Science & Space",
    tags: JSON.stringify(["nasa", "space", "earth", "iss", "astronomy"]),
    rating: 5,
    isArchived: true,
    notes: [
      {
        content: "Aurora borealis visible over North America, magnificent view.",
        videoTimestamp: 120,
      },
    ],
  },
  {
    youtubeUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    youtubeId: "jfKfPfyJRdk",
    title: "lofi hip hop radio - beats to relax/study to",
    thumbnailUrl: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg",
    author: "Lofi Girl",
    authorImageUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
    subject: "Music & Relaxation",
    tags: JSON.stringify(["lofi", "beats", "relax", "chill", "focus"]),
    rating: 4,
    isArchived: true,
    notes: [
      {
        content: "Great background audio for the living room.",
        videoTimestamp: 0,
      },
    ],
  },
  {
    youtubeUrl: "https://www.youtube.com/watch?v=aircAruvnKk",
    youtubeId: "aircAruvnKk",
    title: "Neural Networks from Scratch - 3Blue1Brown",
    thumbnailUrl: "https://i.ytimg.com/vi/aircAruvnKk/hqdefault.jpg",
    author: "3Blue1Brown",
    authorImageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    subject: "Artificial Intelligence",
    tags: JSON.stringify(["ai", "machine-learning", "math", "neural-networks", "education"]),
    rating: 5,
    isArchived: false,
    notes: [
      {
        content: "Crucial explanation of gradient descent and weight matrices.",
        videoTimestamp: 340,
      },
    ],
  },
  {
    youtubeUrl: "https://www.youtube.com/watch?v=M576WGiDBdQ",
    youtubeId: "M576WGiDBdQ",
    title: "World's Most Beautiful Places in 4K Ultra HD",
    thumbnailUrl: "https://i.ytimg.com/vi/M576WGiDBdQ/hqdefault.jpg",
    author: "Scenic Relaxation",
    authorImageUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=150&auto=format&fit=crop&q=80",
    subject: "Travel & Exploration",
    tags: JSON.stringify(["travel", "relax", "landscape", "mountains", "4k"]),
    rating: 3,
    isArchived: false,
    notes: [],
  },
];

async function main() {
  const force = process.argv.includes("--force");
  const existing = await prisma.video.count();
  if (existing > 0 && !force) {
    console.log(
      `Library already has ${existing} video(s); nothing seeded.\n` +
        "Run `npm run db:seed -- --force` to DELETE all videos and notes and load the samples."
    );
    return;
  }

  console.log("Seeding sample videos...");
  await prisma.note.deleteMany({});
  await prisma.video.deleteMany({});

  for (const item of sampleVideos) {
    const { notes, ...videoData } = item;
    const video = await prisma.video.create({
      data: videoData,
    });

    if (notes && notes.length > 0) {
      for (const note of notes) {
        await prisma.note.create({
          data: {
            videoId: video.id,
            content: note.content,
            videoTimestamp: note.videoTimestamp,
          },
        });
      }
    }
  }

  console.log(`Database seeded with ${sampleVideos.length} videos!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
