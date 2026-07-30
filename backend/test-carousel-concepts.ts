import { CarouselConceptChain } from './src/ai/chains/carousel-concept.chain';

async function testConcepts() {
  const chain = new CarouselConceptChain();
  
  const goals = [
    'showcase_a_result',
    'educational_tips',
    'promotional',
    'convert_to_a_booking',
    'build_a_trust'
  ];

  for (const goal of goals) {
    console.log(`\n\n=== TESTING GOAL: ${goal} ===`);
    const result = await chain.generate({
      hookSentence: "Struggling with dry skin?",
      callToAction: "Book your facial today",
      serviceName: "Ayurvedic Hydration Facial",
      clientFirstName: "Sarah",
      businessGoal: goal,
      brandName: "Glow & Co",
      slideCount: 4,
    });

    console.log(JSON.stringify(result, null, 2));
  }
}

testConcepts().catch(console.error);
