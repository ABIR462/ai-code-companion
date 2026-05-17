import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("https://supernova-image.vercel.app");
  }, [navigate]);

  return null;
};

export default Index;
