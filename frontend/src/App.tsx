import React, { useEffect, useState } from "react";
import "./App.css";

interface SampleData {
  id: number;
  name: string;
  description: string;
}

function App() {
  const [message, setMessage] = useState("");
  const [data, setData] = useState<SampleData[]>([]);

  const apiUrl =
    process.env.REACT_APP_API_URL || "http://localhost:5000/api";

  useEffect(() => {
    fetch(`${apiUrl}/message`)
      .then((res) => res.json())
      .then((data) => setMessage(data.text))
      .catch((err) => console.error("Error fetching message:", err));

    fetch(`${apiUrl}/data`)
      .then((res) => res.json())
      .then((data) => setData(data))
      .catch((err) => console.error("Error fetching data:", err));
  }, [apiUrl]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Cloud Infrastructure Project</h1>

        <p>Message from backend: {message}</p>

        <h2>Data from Database:</h2>

        <ul>
          {data.map((item) => (
            <li key={item.id}>
              <strong>{item.name}</strong>: {item.description}
            </li>
          ))}
        </ul>
      </header>
    </div>
  );
}

export default App;