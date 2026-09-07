import Header from "@/components/Header";
import HeroDetail from "@/components/HeroDetail";
import KeyPoints from "@/components/KeyPoints";
import NaturalIngredients from "@/components/NaturalIngredients";
import HonestPrinciple from "@/components/HonestPrinciple";
import ProductionStory from "@/components/ProductionStory";
import UsageSteps from "@/components/UsageSteps";
import FlavorCombination from "@/components/FlavorCombination";
import NutritionTable from "@/components/NutritionTable";
import FaqSection from "@/components/FaqSection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <HeroDetail />
        <KeyPoints />
        <NaturalIngredients />
        <HonestPrinciple />
        <ProductionStory />
        <UsageSteps />
        <FlavorCombination />
        <NutritionTable />
        <FaqSection />
        <ContactSection />
      </main>
      <Footer />
    </>
  );
}
