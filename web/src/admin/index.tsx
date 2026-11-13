// 后台入口：整个后台作为单独的代码块按需加载，客户打开商城不会下载这部分代码。
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin } from "./session.tsx";
import { AdminLayout } from "./Layout.tsx";
import { Login } from "./Login.tsx";
import { Products } from "./Products.tsx";
import { ProductEdit } from "./ProductEdit.tsx";
import { Categories } from "./Categories.tsx";
import { Orders } from "./Orders.tsx";
import { OrderEdit } from "./OrderEdit.tsx";

export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<Navigate to="orders" replace />} />
        <Route path="products" element={<Products />} />
        <Route path="products/new" element={<ProductEdit />} />
        <Route path="products/:id" element={<ProductEdit />} />
        <Route path="categories" element={<Categories />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:orderNo" element={<OrderEdit />} />
        <Route path="*" element={<Navigate to="products" replace />} />
      </Route>
    </Routes>
  );
}
