import { posts } from "@/data/posts";
import { withBasePath } from "@/lib/basePath";

function PostCard({ post }) {
  const inner = (
    <>
      {post.image ? (
        <div className="post-card-bg">
          <img src={withBasePath(post.image)} alt="" />
        </div>
      ) : (
        <div className="post-card-bg empty">
          <span>🖼 사진 추가</span>
        </div>
      )}
      {post.badge && <span className="post-badge">{post.badge}</span>}
      <div className="post-card-overlay">
        <div className="post-title">{post.title}</div>
        <div className="post-summary">{post.summary}</div>
      </div>
    </>
  );

  if (post.link) {
    return (
      <a
        className="post-card"
        href={post.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        {inner}
      </a>
    );
  }
  return <div className="post-card">{inner}</div>;
}

export default function PostsGrid() {
  return (
    <section className="posts-section" id="posts">
      <div className="container">
        <div className="posts-grid">
          {posts.map((post) => (
            <PostCard post={post} key={post.id} />
          ))}
        </div>
      </div>
    </section>
  );
}
