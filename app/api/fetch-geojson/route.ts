import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { signedURL } = await request.json();
    
    if (!signedURL) {
      return NextResponse.json(
        { error: 'signedURL is required' },
        { status: 400 }
      );
    }

    // Fetch the GeoJSON from the signed URL
    const response = await fetch(signedURL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DJI-Field-Extractor/1.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch GeoJSON: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const geoJson = await response.json();

    return NextResponse.json({ 
      success: true, 
      data: geoJson 
    });

  } catch (error) {
    console.error('Error fetching GeoJSON:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}