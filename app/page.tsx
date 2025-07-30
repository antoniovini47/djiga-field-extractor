'use client';

import { useState } from 'react';

interface GeometryStorage {
  signedURL: string;
  uuid: string;
  contentMd5: string;
}

interface LandNode {
  uuid: string;
  name: string;
  geometry: {
    storage: GeometryStorage;
  };
}

interface GraphQLResponse {
  data: {
    lands: {
      edges: Array<{
        node: LandNode;
      }>;
    };
  };
}

interface DownloadItem {
  uuid: string;
  name: string;
  signedURL: string;
  geoJson?: any;
  isLoading?: boolean;
  error?: string;
}

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Sanitize filename for cross-platform compatibility
  const sanitizeFilename = (filename: string): string => {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid characters with underscore
      .replace(/\s+/g, '_')           // Replace spaces with underscore
      .trim();
  };

  // Convert GeoJSON to KML format
  const convertGeoJsonToKml = (geoJson: any, name: string): string => {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <description>Converted from GeoJSON</description>
`;

    if (geoJson.type === 'FeatureCollection') {
      geoJson.features.forEach((feature: any, index: number) => {
        if (feature.geometry && feature.geometry.type === 'Polygon') {
          kml += `    <Placemark>
      <name>${feature.properties?.name || `${name} - Area ${index + 1}`}</name>
      <description>${feature.properties?.funcType || 'Polygon area'}</description>
      <Polygon>
        <extrude>1</extrude>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
`;
          
          // Convert coordinates from [lng, lat, alt] to lng,lat,alt format
          if (feature.geometry.coordinates[0]) {
            feature.geometry.coordinates[0].forEach((coord: number[]) => {
              kml += `              ${coord[0]},${coord[1]},${coord[2] || 0}\n`;
            });
          }
          
          kml += `            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
`;
        } else if (feature.geometry && feature.geometry.type === 'MultiPoint') {
          // Handle reference points
          feature.geometry.coordinates.forEach((coord: number[], pointIndex: number) => {
            kml += `    <Placemark>
      <name>Reference Point ${pointIndex + 1}</name>
      <description>Reference point</description>
      <Point>
        <coordinates>${coord[0]},${coord[1]},${coord[2] || 0}</coordinates>
      </Point>
    </Placemark>
`;
          });
        }
      });
    }

    kml += `  </Document>
</kml>`;
    
    return kml;
  };

  const generateDownloadLinks = async () => {
    try {
      setIsGenerating(true);
      const response: GraphQLResponse = JSON.parse(inputText);
      
      const items: DownloadItem[] = response.data.lands.edges.map(edge => ({
        uuid: edge.node.uuid,
        name: edge.node.name,
        signedURL: edge.node.geometry.storage.signedURL,
      }));
      
      setDownloadItems(items);
    } catch (error) {
      alert('Error parsing JSON. Please check the format.');
      console.error('Parse error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchGeoJsonData = async (item: DownloadItem, index: number) => {
    if (item.geoJson) return item.geoJson; // Return cached data if available
    
    try {
      // Update loading state
      setDownloadItems(prev => prev.map((prevItem, i) => 
        i === index ? { ...prevItem, isLoading: true, error: undefined } : prevItem
      ));

      // Use our API route to fetch the GeoJSON (bypasses CORS)
      const response = await fetch('/api/fetch-geojson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signedURL: item.signedURL }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      const geoJson = result.data;
      
      // Update with fetched data
      setDownloadItems(prev => prev.map((prevItem, i) => 
        i === index ? { ...prevItem, geoJson, isLoading: false } : prevItem
      ));

      return geoJson;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setDownloadItems(prev => prev.map((prevItem, i) => 
        i === index ? { ...prevItem, isLoading: false, error: errorMessage } : prevItem
      ));
      throw error;
    }
  };

  const copyToClipboard = async (item: DownloadItem, index: number) => {
    try {
      const geoJson = await fetchGeoJsonData(item, index);
      const geoJsonString = JSON.stringify(geoJson, null, 2);
      await navigator.clipboard.writeText(geoJsonString);
      alert(`Conteúdo GeoJSON de "${item.name}" copiado para a área de transferência!`);
    } catch (error) {
      alert(`Erro ao copiar GeoJSON: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  const downloadGeoJson = async (item: DownloadItem, index: number) => {
    try {
      const geoJson = await fetchGeoJsonData(item, index);
      const geoJsonString = JSON.stringify(geoJson, null, 2);
      
      const blob = new Blob([geoJsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFilename(item.name)}.geojson`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert(`GeoJSON de "${item.name}" baixado com sucesso!`);
    } catch (error) {
      alert(`Erro ao baixar GeoJSON: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  const downloadKml = async (item: DownloadItem, index: number) => {
    try {
      const geoJson = await fetchGeoJsonData(item, index);
      const kmlString = convertGeoJsonToKml(geoJson, item.name);
      
      const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFilename(item.name)}.kml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert(`KML de "${item.name}" baixado com sucesso!`);
    } catch (error) {
      alert(`Erro ao baixar KML: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">DJI Field Data Extractor</h1>
      
      {/* Instructions Section */}
      <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-blue-800">Instructions</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Abra o inspetor de elementos</li>
          <li>Vá para a aba "Network"</li>
          <li>Faça uma busca pelo nome do campo</li>
          <li>Clique com o botão direito no último item da lista "graphql?name=lands"</li>
          <li>Copie a resposta na aba "Copy &gt; Copy response"</li>
          <li>Cole o conteúdo abaixo</li>
          <li>Clique para gerar os links de download</li>
        </ol>
      </div>

      {/* Input Section */}
      <div className="mb-6">
        <label htmlFor="jsonInput" className="block text-sm font-medium text-gray-700 mb-2">
          Cole a Resposta GraphQL:
        </label>
        <textarea
          id="jsonInput"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="w-full h-64 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
          placeholder='Cole sua resposta GraphQL aqui (ex: {"data":{"lands":{"edges":[...]}}...})'
        />
      </div>

      {/* Generate Button */}
      <div className="mb-8">
        <button
          onClick={generateDownloadLinks}
          disabled={!inputText.trim() || isGenerating}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md font-medium transition-colors"
        >
          {isGenerating ? 'Gerando...' : 'Gerar Links de Download'}
        </button>
      </div>

      {/* Download Links Section */}
      {downloadItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">Links de Download ({downloadItems.length} itens)</h2>
          <div className="grid gap-4">
            {downloadItems.map((item, index) => (
              <div key={item.uuid} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                <div className="mb-4">
                  <h3 className="font-medium text-gray-900">{item.name}</h3>
                  <p className="text-sm text-gray-500">UUID: {item.uuid}</p>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    onClick={() => copyToClipboard(item, index)}
                    disabled={item.isLoading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2"
                  >
                    {item.isLoading ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                        Carregando...
                      </>
                    ) : (
                      'Copiar conteúdo'
                    )}
                  </button>
                  
                  <button
                    onClick={() => downloadGeoJson(item, index)}
                    disabled={item.isLoading}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2"
                  >
                    {item.isLoading ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                        Carregando...
                      </>
                    ) : (
                      'Baixar GeoJSON'
                    )}
                  </button>
                  
                  <button
                    onClick={() => downloadKml(item, index)}
                    disabled={item.isLoading}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2"
                  >
                    {item.isLoading ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                        Carregando...
                      </>
                    ) : (
                      'Baixar KML'
                    )}
                  </button>
                </div>
                
                {item.error && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                    Erro: {item.error}
                  </div>
                )}
                
                {item.geoJson && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                    <span className="text-green-600 font-medium">✓ Dados GeoJSON carregados e prontos para uso</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
