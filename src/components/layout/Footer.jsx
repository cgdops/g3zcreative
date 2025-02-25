import React from 'react';
import { Box, Container, Typography, Link } from '@mui/material';
import { styled } from '@mui/material/styles';

const FooterWrapper = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.default,
  borderTop: `1px solid ${theme.palette.divider}`,
  paddingTop: theme.spacing(3),
  paddingBottom: theme.spacing(3),
  marginTop: 'auto'
}));

const Footer = () => {
  return (
    <FooterWrapper>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            Christian Gomez
          </Typography>
          <Typography variant="subtitle1" color="textSecondary" gutterBottom>
            Founder of G3Z Creative
          </Typography>
          <Link 
            href="mailto:Chris@G3ZCreative.com"
            color="primary"
            sx={{ 
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline'
              }
            }}
          >
            Chris@G3ZCreative.com
          </Link>
        </Box>
      </Container>
    </FooterWrapper>
  );
};

export default Footer;