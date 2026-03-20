package co.edu.eci.blueprints.auth;

import co.edu.eci.blueprints.security.InMemoryUserService;
import co.edu.eci.blueprints.security.RsaKeyProperties;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/auth")
@Tag(name = "Autenticacion", description = "Obtencion de tokens JWT mediante credenciales de usuario")
public class AuthController {

        private final JwtEncoder encoder;
        private final InMemoryUserService userService;
        private final RsaKeyProperties props;

        public AuthController(JwtEncoder encoder, InMemoryUserService userService, RsaKeyProperties props) {
                this.encoder = encoder;
                this.userService = userService;
                this.props = props;
        }

        @Schema(description = "Credenciales de acceso del usuario")
        public record LoginRequest(
                        @Schema(description = "Nombre de usuario", example = "student", requiredMode = Schema.RequiredMode.REQUIRED) String username,
                        @Schema(description = "Contrasena en texto plano", example = "student123", requiredMode = Schema.RequiredMode.REQUIRED) String password) {
        }

        @Schema(description = "Respuesta con el token de acceso emitido")
        public record TokenResponse(
                        @Schema(description = "Token JWT firmado con RS256") String access_token,
                        @Schema(description = "Tipo de token (siempre Bearer)", example = "Bearer") String token_type,
                        @Schema(description = "Tiempo de vida del token en segundos (configurable via blueprints.security.token-ttl-seconds)", example = "3600") long expires_in) {
        }

        @Operation(summary = "Iniciar sesion", description = "Autentica al usuario con username y password. Si las credenciales son validas devuelve un JWT firmado con RS256. "
                        +
                        "Usuarios disponibles: student/student123 y assistant/assistant123. " +
                        "El TTL del token se controla con blueprints.security.token-ttl-seconds en application.yml.")
        @ApiResponses({
                        @ApiResponse(responseCode = "200", description = "Credenciales validas - se devuelve el token JWT", content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = TokenResponse.class), examples = @ExampleObject(value = "{\"access_token\": \"eyJhbGciOiJSUzI1NiJ9...\", \"token_type\": \"Bearer\", \"expires_in\": 3600}"))),
                        @ApiResponse(responseCode = "401", description = "Credenciales invalidas", content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, examples = @ExampleObject(value = "{\"error\": \"invalid_credentials\"}")))
        })
        @PostMapping("/login")
        public ResponseEntity<?> login(@RequestBody LoginRequest req) {
                if (!userService.isValid(req.username(), req.password())) {
                        return ResponseEntity.status(401).body(Map.of("error", "invalid_credentials"));
                }

                Instant now = Instant.now();
                long ttl = props.tokenTtlSeconds() != null ? props.tokenTtlSeconds() : 3600;
                Instant exp = now.plusSeconds(ttl);

                String scope = req.username().equals("assistant")
                                ? "blueprints.read blueprints.write"
                                : "blueprints.read";

                JwtClaimsSet claims = JwtClaimsSet.builder()
                                .issuer(props.issuer())
                                .issuedAt(now)
                                .expiresAt(exp)
                                .subject(req.username())
                                .claim("scope", scope)
                                .build();

                JwsHeader jws = JwsHeader.with(() -> "RS256").build();
                String token = this.encoder.encode(JwtEncoderParameters.from(jws, claims)).getTokenValue();

                return ResponseEntity.ok(new TokenResponse(token, "Bearer", ttl));
        }
}