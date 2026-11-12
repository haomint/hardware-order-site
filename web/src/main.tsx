import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { ShopProvider } from "./lib/shop.tsx";
import { ToastHost } from "./components/Feedback.tsx";
import { EmptyNotice } from "./components/Feedback.tsx";
import { Home } from "./pages/Home.tsx";
import { ProductDetail } from "./pages/ProductDetail.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ShopProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/p/:id" element={<ProductDetail />} />
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
      </ShopProvider>
    </BrowserRouter>
  </StrictMode>,
);
