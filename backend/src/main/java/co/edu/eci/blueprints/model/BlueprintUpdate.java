package co.edu.eci.blueprints.model;

import java.util.List;

public record BlueprintUpdate(String author, String name, List<Point> points) {}
