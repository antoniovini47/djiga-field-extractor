'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

interface GeoJsonFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][];
  };
  properties?: {
    name?: string;
    funcType?: string;
  };
}

interface GeoJsonData {
  type: string;
  features: GeoJsonFeature[];
}

interface DownloadItem {
  uuid: string;
  name: string;
  signedURL: string;
  geoJson?: GeoJsonData;
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
  const convertGeoJsonToKml = (geoJson: GeoJsonData, name: string): string => {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <description>Converted from GeoJSON</description>
`;

    if (geoJson.type === 'FeatureCollection') {
      geoJson.features.forEach((feature: GeoJsonFeature, index: number) => {
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
          if (feature.geometry.coordinates && feature.geometry.coordinates[0]) {
            const outerRing = feature.geometry.coordinates[0] as number[][];
            outerRing.forEach((coord: number[]) => {
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
          const coordinates = feature.geometry.coordinates as number[][];
          coordinates.forEach((coord: number[], pointIndex: number) => {
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="container mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">DJI Field Data Extractor</h1>
          <p className="text-gray-600 mt-2">Extrair e converter dados geoespaciais em <span className="text-blue-600 font-semibold">GeoJSON</span> e <span className="text-purple-600 font-semibold">KML</span></p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-180px)]">
          {/* Left Column - Input Section */}
          <div className="space-y-4">
            {/* Instructions Card */}
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Instruções</CardTitle>
                <CardDescription>Siga estas etapas para extrair os dados do campo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 text-xs">1</Badge>
                    <span>Abra o inspetor de elementos</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 text-xs">2</Badge>
                    <span>Vá para a aba &ldquo;Network&rdquo;</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 text-xs">3</Badge>
                    <span>Faça uma busca pelo nome do campo</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 text-xs">4</Badge>
                    <span>Clique com o botão direito no último item da lista &ldquo;graphql?name=lands&rdquo;</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 text-xs">5</Badge>
                    <span>Copie a resposta na aba &ldquo;Copy &gt; Copy response&rdquo;</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 text-xs">6</Badge>
                    <span>Cole o conteúdo abaixo</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Input Card */}
            <Card className="flex-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Resposta GraphQL</CardTitle>
                <CardDescription>Copie e cole a resposta copiada da aba de rede do navegador</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 h-[calc(100%-80px)]">
                <div className="space-y-2 flex-1 flex flex-col">
                  <Label htmlFor="jsonInput">Resposta GraphQL</Label>
                  <textarea
                    id="jsonInput"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="w-full flex-1 min-h-[200px] p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm resize-none"
                    placeholder='{"data":{"lands":{"edges":[...]}}...}'
                  />
                </div>
                <Button
                  onClick={generateDownloadLinks}
                  disabled={!inputText.trim() || isGenerating}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? 'Gerando...' : 'Gerar Links de Download'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Results Section */}
          <div className="space-y-4">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Links de Download</CardTitle>
                    <CardDescription>Opções de download geradas para seus dados</CardDescription>
                  </div>
                  {downloadItems.length > 0 && (
                    <Badge variant="secondary">{downloadItems.length} itens</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="h-[calc(100%-100px)] overflow-auto">
                {downloadItems.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <div className="text-center">
                      <div className="text-4xl mb-2">🔍</div>
                      <p>Nenhum dado gerado ainda</p>
                      <p className="text-sm">Copie a resposta GraphQL e clique em &quot;Gerar Links de Download&quot;</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {downloadItems.map((item, index) => (
                      <Card key={item.uuid} className="border-gray-200">
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <div>
                              <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                              <p className="text-xs text-gray-500 font-mono">{item.uuid}</p>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() => copyToClipboard(item, index)}
                                disabled={item.isLoading}
                                variant="outline"
                                size="sm"
                                className="flex-1 min-w-0"
                              >
                                {item.isLoading ? (
                                  <div className="animate-spin h-3 w-3 border-2 border-gray-400 border-t-transparent rounded-full mr-1" />
                                ) : null}
                                <span className="truncate">Copiar</span>
                              </Button>
                              
                              <Button
                                onClick={() => downloadGeoJson(item, index)}
                                disabled={item.isLoading}
                                size="sm"
                                className="flex-1 min-w-0 bg-green-600 hover:bg-green-700"
                              >
                                {item.isLoading ? (
                                  <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1" />
                                ) : null}
                                <span className="truncate">GeoJSON</span>
                              </Button>
                              
                              <Button
                                onClick={() => downloadKml(item, index)}
                                disabled={item.isLoading}
                                size="sm"
                                className="flex-1 min-w-0 bg-purple-600 hover:bg-purple-700"
                              >
                                {item.isLoading ? (
                                  <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1" />
                                ) : null}
                                <span className="truncate">KML</span>
                              </Button>
                            </div>
                            
                            {item.error && (
                              <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                                <strong>Erro:</strong> {item.error}
                              </div>
                            )}
                            
                            {item.geoJson && !item.isLoading && (
                              <div className="flex items-center gap-1 text-xs text-green-600">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span>Dados carregados</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
