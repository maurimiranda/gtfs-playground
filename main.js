// Create main map object and center to Luxemburg
const map = L.map('map').setView([49.61, 6.11], 12);

// Create map pane for routes lines to be shown always behind stops points
// Default zIndex for overlay layers is 400
map.createPane('routes');
map.getPane('routes').style.zIndex = 300;

// Add OSM as base layer
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Add layer switcher control
const layersControl = L.control.layers({
  'OpenStreetMap': osmLayer,
}, {}, {
  collapsed: false,
}).addTo(map);

// Define container elements
const stopList = document.getElementById('stopList');
const distanceLegend = document.getElementById('distanceLegend');

// Define main layers
let routesLayer, stopsLayer;

// Reset marker styles and hide legend
const resetStops = () => {
  stopsLayer.eachLayer((l) => {
    delete l.feature.properties.distance;
    stopsLayer.resetStyle(l);
  });
  distanceLegend.style.display = 'none';
  stopList.style.display = 'none';
  map.scrollWheelZoom.enable();
};

// Get GeoJSON files
Promise.all([
  fetch('./data/stops.geojson').then(response => response.json()),
  fetch('./data/routes.geojson').then(response => response.json()),
]).then(data => {
  const [stops, routes] = data;

  // Create routes lines layer
  routesLayer = L.geoJSON(routes, {
    pane: 'routes',

    style: {
      color: '#666',
      weight: 2,
      opacity: 0.5
    },

    onEachFeature: (feature, layer) => {
      let points = [];

      // On feature hover, change style, bring to front and find related stops
      layer.on('mouseover', (e) => {
        layer.setStyle({
          color: '#FF8000',
          weight: 5,
          opacity: 1,
        });

        layer.bringToFront();

        // If stops layer is not visible, do not continue
        if (!map.hasLayer(stopsLayer)) return;

        // Find stops that belong to the current selected route
        const line = layer.toGeoJSON();
        stopsLayer.eachLayer((l) => {
          if (turf.booleanPointOnLine(l.toGeoJSON(), line)) {
            points.push(l);
            l.setStyle({
              color: '#FF8000',
              weight: 2,
              opacity: 1,
              fillColor: '#FFF',
            });
            l.bringToFront();
          }
        });

        // Remove duplicates
        points = points.filter((l, i, a) => i === a.indexOf(l));
      });

      // Clean list and styles when there's not selected route
      layer.on('mouseout', (e) => {
        routesLayer.resetStyle(layer);
        points.forEach((l) => stopsLayer.resetStyle(l));
      });

      // Add stops to the list and show it
      layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);

        map.scrollWheelZoom.disable();
        stopList.innerHTML = points.map(stop => `<li>${stop.feature.properties.stop_id}: ${stop.feature.properties.stop_name}</li>`).join('');
        stopList.style.display = 'block';
      });
    }
  });

  // Create stops points layer
  stopsLayer = L.geoJSON(stops, {

    // Render points as circle markers (much faster than regular markers)
    pointToLayer: (feature, latlng) => {
      return L.circleMarker(latlng, {
        color: '#000',
        weight: 1,
        opacity: 0.5,
        fillOpacity: 1,
        fillColor: '#666',
        radius: 5,
      });
    },

    onEachFeature: (feature, layer) => {
      layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);

        // If routes layer is active, return to avoid click events conflict
        if (map.hasLayer(routesLayer)) return;

        // Calculate distances from selected feature
        stops.features.forEach((stop) => {
          stop.properties.distance = turf.distance(feature, stop.geometry);
        });

        // Set style based on distance
        stopsLayer.eachLayer((l) => {
          l.setStyle({
            fillColor: ((distance) => {
              if (distance === 0) return '#FF0000';
              if (distance <= 3) return '#FF8000';
              if (distance <= 10) return '#FFFF00';
              if (distance <= 15) return '#00FF00';
              if (distance <= 50) return '#00FFAA';
              return '#00FFFF';
            })(l.feature.properties.distance),
          });
        });

        // Show legend
        distanceLegend.style.display = 'block';

        // Move selected feature to top
        layer.bringToFront();
      });
    }
  })
    // Display stop name on mouse hover including distance to selected feature
    .bindTooltip(layer => `${layer.feature.properties.stop_name}${layer.feature.properties.distance ? ` (${layer.feature.properties.distance.toFixed(2)} km)` : ''}`);

  // Generate heatmap based on stops geojson data
  const pointsArray = stops.features.map(point => [point.geometry.coordinates[1], point.geometry.coordinates[0]]);
  const heatmapLayer = L.heatLayer(pointsArray, { radius: 80 });

  // Add default layers to map
  map.addLayer(stopsLayer);

  // Add layers to switcher control
  layersControl.addOverlay(stopsLayer, 'Stops');
  layersControl.addOverlay(heatmapLayer, 'Stops Heatmap');
  layersControl.addOverlay(routesLayer, 'Routes');

  // On map click, reset stop layers style
  map.on('click', resetStops);

  // Reset stops layer when routes layer is added or removed
  routesLayer.on('add', () => {
    if (!map.hasLayer(stopsLayer)) map.addLayer(stopsLayer);
    resetStops();
  });
  routesLayer.on('remove', resetStops);
});