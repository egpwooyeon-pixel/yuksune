import Header from "@/components/Header";
import Hero from "@/components/Hero";
import PostsGrid from "@/components/PostsGrid";
import Footer from "@/components/Footer";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <PostsGrid />
      </main>
      <Footer />
    </>
  );
}
