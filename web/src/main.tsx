import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { ShopProvider } from "./lib/shop.tsx";
import { EmptyNotice, ToastHost } from "./components/Feedback.tsx";
import { Home } from "./pages/Home.tsx";
import { ProductDetail } from "./pages/ProductDetail.tsx";
import { Categories } from "./pages/Categories.tsx";
import { Cart } from "./pages/Cart.tsx";
import { Privacy } from "./pages/Privacy.tsx";
import { ContactSheet } from "./components/ContactSheet.tsx";

// 后台按需加载，客户不会下载后台代码。
const AdminApp = lazy(() => import("./admin/index.tsx"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ShopProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/p/:id" element={<ProductDetail />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<p className="py-20 text-center text-base text-muted">正在打开后台…</p>}>
                <AdminApp />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <EmptyNotice title="页面不存在">
                <a href="/" className="text-brand underline">
                  回到首页
                </a>
              </EmptyNotice>
            }
          />
        </Routes>
        <ToastHost />
        <ContactSheet />
      </ShopProvider>
    </BrowserRouter>
  </StrictMode>,
);
